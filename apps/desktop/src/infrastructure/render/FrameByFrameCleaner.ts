import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import * as ort from "onnxruntime-node";
import type {
  ClutterCleanProgress,
  ClutterCleanResult,
  ClutterCleaner,
} from "../../application/ClutterCleaner.js";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";
import { readVideoMetadata } from "../ffmpeg/ffprobeMetadata.js";
import { detectClutterRegions } from "../vision/detectClutterRegions.js";
import { resizeRgb } from "../vision/resizeRgb.js";
import type { Box } from "../vision/unionBoxWithMargin.js";

export interface FrameByFrameCleanerOptions {
  /** Menor = mais agressivo. Ver `DEFAULT_ZSCORE_THRESHOLD` e docs/ml/CLUTTER_DETECTION.md. */
  zScoreThreshold?: number;
  minRegionCells?: number;
}

/**
 * Agressividade padrão da detecção. Varredura real feita nos vídeos de imóvel
 * do usuário (cobertura do quadro marcada como bagunça):
 *
 * | limiar | cobertura |
 * |--------|-----------|
 * | 5,0    | 0–1%      |
 * | 3,5    | 7–8%      |
 * | 2,5    | 12–17%    |
 * | 2,0    | 20–27%    |
 *
 * Em 5,0 (o padrão de `clutter.detect`, pensado pra apenas *apontar* bagunça
 * num relatório) o vídeo reclamado voltava com "0 objetos detectados" estando
 * visivelmente bagunçado. Aqui o objetivo é outro — reconstruir de fato —, e
 * a regra do produto é "na dúvida, tira": some um móvel e tudo bem, o que não
 * pode é sobrar sujeira. 2,5 fica na faixa agressiva sem chegar ao ponto em
 * que um quarto do quadro passa a ser pixel inventado pelo modelo.
 */
const DEFAULT_ZSCORE_THRESHOLD = 2.5;

/** Resolução em que o LaMa roda. 128 ≈ 357ms/quadro; 256 ≈ 979ms (medido). */
const INFERENCE_SIZE = 128;
/** Contexto ao redor da bagunça — o modelo precisa de vizinhança pra inventar algo plausível. */
const CONTEXT_MARGIN_RATIO = 0.25;
/**
 * Se a MÁSCARA (não o recorte) cobre mais que isto, não sobrou vizinhança
 * de onde reconstruir: sinal de quadro atípico (corte, estouro de luz) e não
 * de bagunça. Reconstruir assim produziria borrão, então o quadro passa
 * intacto. Repare que o limite é sobre a máscara: as regiões de bagunça podem
 * estar espalhadas pelo quadro inteiro — aí o recorte é grande mas a área a
 * reconstruir continua pequena, e o quadro *precisa* ser limpo.
 */
const MAX_MASK_COVERAGE = 0.6;

/**
 * Remove bagunça QUADRO A QUADRO, gerando um vídeo novo.
 *
 * Por que existe: o caminho antigo gerava UM remendo a partir de um único
 * quadro e o colava, parado, sobre a cena inteira. Isso só funciona com
 * câmera imóvel — em vídeo de imóvel real (alguém andando pela casa) o
 * remendo desliza e vira um adesivo óbvio. Medido num caso real: pontuação
 * de movimento 16,2 contra um limiar de 12, ou seja, praticamente toda cena
 * caía no borrão (`delogo`) e a bagunça continuava lá.
 *
 * Aqui cada quadro é detectado e reconstruído por conta própria, então
 * movimento de câmera deixa de ser problema. O custo é tempo: ~16 min pra um
 * vídeo de 1min30 (decisão de produto aceita explicitamente pelo usuário).
 *
 * Streaming de ponta a ponta (ffmpeg -> stdin/stdout -> ffmpeg): nada de
 * despejar milhares de PNGs no disco. Um quadro 1080p tem ~6MB; em fluxo, a
 * memória fica constante.
 */
export class FrameByFrameCleaner implements ClutterCleaner {
  private session: ort.InferenceSession | null = null;

  constructor(
    private readonly modelPath: string,
    private readonly options: FrameByFrameCleanerOptions = {},
  ) {}

  isAvailable(): boolean {
    return existsSync(this.modelPath);
  }

  async discard(outputPath: string): Promise<void> {
    try {
      rmSync(outputPath, { force: true });
    } catch (error) {
      // Um arquivo preso não pode derrubar um render que já deu certo.
      console.error(`[limpeza] não consegui apagar o intermediário ${outputPath}:`, error);
    }
  }

  private async ensureSession(): Promise<ort.InferenceSession> {
    // graphOptimizationLevel 'disabled' é obrigatório: com as otimizações
    // padrão o ONNX Runtime reaproveita buffer errado nos nós DFT do LaMa
    // (ver tools/inpainting/README.md).
    this.session ??= await ort.InferenceSession.create(this.modelPath, {
      graphOptimizationLevel: "disabled",
    });
    return this.session;
  }

  async clean(
    sourcePath: string,
    outputPath: string,
    onProgress?: (progress: ClutterCleanProgress) => void,
  ): Promise<ClutterCleanResult> {
    const meta = await readVideoMetadata(sourcePath);
    const { width, height } = meta;
    const frameBytes = width * height * 3;
    const fps = meta.fps > 0 ? meta.fps : 30;
    const session = await this.ensureSession();

    const decoder = spawn(FFMPEG_PATH, [
      "-i", sourcePath,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]);
    const encoder = spawn(FFMPEG_PATH, [
      "-y",
      "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", `${width}x${height}`,
      "-r", String(fps),
      "-i", "-",
      // Áudio do original, se houver — reconstruir só o vídeo não pode
      // silenciar o vídeo do usuário.
      "-i", sourcePath,
      "-map", "0:v", "-map", "1:a?",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy",
      "-shortest",
      outputPath,
    ]);

    const totalFrames = meta.fps > 0 ? Math.round((meta.durationMs / 1000) * meta.fps) : 0;
    let framesProcessed = 0;
    let framesChanged = 0;

    let decoderError = "";
    let encoderError = "";
    decoder.stderr.on("data", (chunk: Buffer) => (decoderError += chunk.toString("utf8")));
    encoder.stderr.on("data", (chunk: Buffer) => (encoderError += chunk.toString("utf8")));

    let fail: (error: Error) => void = () => {};
    const finished = new Promise<void>((resolve, reject) => {
      fail = reject;
      encoder.on("error", reject);
      decoder.on("error", reject);
      encoder.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg (encode) saiu com ${code}: ${encoderError.slice(-2000)}`));
      });
    });

    let pending = Buffer.alloc(0);
    let chain: Promise<void> = Promise.resolve();
    let inFlight = 0;

    decoder.stdout.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= frameBytes) {
        const frame = pending.subarray(0, frameBytes);
        pending = pending.subarray(frameBytes);
        inFlight++;
        // Contrapressão: sem pausar, o decoder despeja o vídeo inteiro na
        // memória enquanto a inferência (ordens de grandeza mais lenta) fica
        // pra trás. Só volta a ler quando a fila esvazia.
        decoder.stdout.pause();
        // Serializa: `session.run` não é seguro pra chamadas concorrentes na
        // mesma sessão, e sem a fila os quadros sairiam fora de ordem.
        chain = chain.then(async () => {
          const { buffer, changed } = await this.cleanFrame(session, frame, width, height);
          if (changed) framesChanged++;
          framesProcessed++;
          onProgress?.({ framesProcessed, totalFrames, framesChanged });
          if (!encoder.stdin.write(buffer)) {
            await new Promise<void>((resolve) => encoder.stdin.once("drain", () => resolve()));
          }
          if (--inFlight === 0) decoder.stdout.resume();
        });
      }
    });

    decoder.stdout.on("end", () => {
      chain = chain.then(() => {
        encoder.stdin.end();
      });
      chain.catch(fail);
    });
    decoder.on("close", (code) => {
      if (code !== 0) {
        encoder.stdin.destroy();
        fail(new Error(`ffmpeg (decode) saiu com ${code}: ${decoderError.slice(-2000)}`));
      }
    });

    await finished;
    return { framesProcessed, framesChanged };
  }

  /** Detecta e reconstrói a bagunça de UM quadro. Devolve o quadro (alterado ou não). */
  private async cleanFrame(
    session: ort.InferenceSession,
    frame: Buffer,
    width: number,
    height: number,
  ): Promise<{ buffer: Buffer; changed: boolean }> {
    const gray = toGrayscale(frame, width, height);
    const regions = detectClutterRegions(gray, width, height, [], {
      zScoreThreshold: this.options.zScoreThreshold ?? DEFAULT_ZSCORE_THRESHOLD,
      ...(this.options.minRegionCells !== undefined
        ? { minRegionCells: this.options.minRegionCells }
        : {}),
    });
    if (regions.length === 0) return { buffer: frame, changed: false };

    const maskArea = regions.reduce((sum, region) => sum + region.width * region.height, 0);
    if (maskArea / (width * height) > MAX_MASK_COVERAGE) {
      return { buffer: frame, changed: false };
    }

    const union = unionWithMargin(regions, width, height);
    const crop = cropRgb(frame, width, union);
    const small = resizeRgb(crop, union.width, union.height, INFERENCE_SIZE, INFERENCE_SIZE);
    const mask = buildMask(regions, union, INFERENCE_SIZE);

    const result = await session.run({
      [session.inputNames[0] as string]: new ort.Tensor(
        "float32",
        toChwFloat(small, INFERENCE_SIZE),
        [1, 3, INFERENCE_SIZE, INFERENCE_SIZE],
      ),
      [session.inputNames[1] as string]: new ort.Tensor("float32", mask, [
        1,
        1,
        INFERENCE_SIZE,
        INFERENCE_SIZE,
      ]),
    });

    const painted = fromChwFloat(
      result[session.outputNames[0] as string]?.data as Float32Array,
      INFERENCE_SIZE,
    );
    const backToCrop = resizeRgb(painted, INFERENCE_SIZE, INFERENCE_SIZE, union.width, union.height);

    // Compõe SÓ dentro das regiões detectadas: o resto do recorte é
    // vizinhança que serviu de contexto e deve permanecer intocada.
    const output = Buffer.from(frame);
    for (const region of regions) {
      for (let y = region.y; y < region.y + region.height && y < height; y++) {
        for (let x = region.x; x < region.x + region.width && x < width; x++) {
          const from = ((y - union.y) * union.width + (x - union.x)) * 3;
          const to = (y * width + x) * 3;
          output[to] = backToCrop[from] as number;
          output[to + 1] = backToCrop[from + 1] as number;
          output[to + 2] = backToCrop[from + 2] as number;
        }
      }
    }
    return { buffer: output, changed: true };
  }
}

function toGrayscale(rgb: Buffer, width: number, height: number): Buffer {
  const gray = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = Math.round(
      0.299 * (rgb[i * 3] as number) +
        0.587 * (rgb[i * 3 + 1] as number) +
        0.114 * (rgb[i * 3 + 2] as number),
    );
  }
  return gray;
}

function unionWithMargin(regions: Box[], width: number, height: number): Box {
  const minX = Math.min(...regions.map((region) => region.x));
  const minY = Math.min(...regions.map((region) => region.y));
  const maxX = Math.max(...regions.map((region) => region.x + region.width));
  const maxY = Math.max(...regions.map((region) => region.y + region.height));
  const marginX = Math.round((maxX - minX) * CONTEXT_MARGIN_RATIO);
  const marginY = Math.round((maxY - minY) * CONTEXT_MARGIN_RATIO);
  const x = Math.max(0, minX - marginX);
  const y = Math.max(0, minY - marginY);
  return {
    x,
    y,
    width: Math.max(8, Math.min(width, maxX + marginX) - x),
    height: Math.max(8, Math.min(height, maxY + marginY) - y),
  };
}

function cropRgb(frame: Buffer, frameWidth: number, box: Box): Buffer {
  const out = Buffer.alloc(box.width * box.height * 3);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * frameWidth + box.x) * 3;
    frame.copy(out, y * box.width * 3, from, from + box.width * 3);
  }
  return out;
}

/** Máscara na resolução do modelo: 1 onde há bagunça (região a reconstruir), 0 no resto. */
function buildMask(regions: Box[], union: Box, size: number): Float32Array {
  const mask = new Float32Array(size * size);
  for (const region of regions) {
    const x0 = Math.floor(((region.x - union.x) / union.width) * size);
    const x1 = Math.ceil(((region.x + region.width - union.x) / union.width) * size);
    const y0 = Math.floor(((region.y - union.y) / union.height) * size);
    const y1 = Math.ceil(((region.y + region.height - union.y) / union.height) * size);
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) mask[y * size + x] = 1;
    }
  }
  return mask;
}

function toChwFloat(rgb: Buffer, size: number): Float32Array {
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    out[i] = (rgb[i * 3] as number) / 255;
    out[plane + i] = (rgb[i * 3 + 1] as number) / 255;
    out[2 * plane + i] = (rgb[i * 3 + 2] as number) / 255;
  }
  return out;
}

function fromChwFloat(data: Float32Array, size: number): Buffer {
  const out = Buffer.alloc(size * size * 3);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    out[i * 3] = clamp255((data[i] as number) * 255);
    out[i * 3 + 1] = clamp255((data[plane + i] as number) * 255);
    out[i * 3 + 2] = clamp255((data[2 * plane + i] as number) * 255);
  }
  return out;
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
