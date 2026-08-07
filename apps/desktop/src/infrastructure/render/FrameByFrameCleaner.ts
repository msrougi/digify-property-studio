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
import { bgr24ToYoloxTensor } from "../ml/yolox/bgr24ToYoloxTensor.js";
import { COCO_CLASSES, type CocoClass } from "../ml/yolox/cocoClasses.js";
import { decodeYoloxOutput } from "../ml/yolox/decodeYoloxOutput.js";
import { letterboxRgbFrame } from "../ml/yolox/letterboxRgbFrame.js";
import { nonMaxSuppression } from "../ml/yolox/nonMaxSuppression.js";
import { isRemovableForCleaning } from "../ml/yolox/removableForCleaning.js";
import { resizeRgb } from "../vision/resizeRgb.js";
import type { Box } from "../vision/unionBoxWithMargin.js";

export interface FrameByFrameCleanerOptions {
  /**
   * Quantos objetos remover por quadro. Cada remoção custa ~346ms de LaMa
   * (medido; o modelo é travado em lote 1, não dá pra paralelizar).
   */
  maxPatchesPerFrame?: number;
  /** Confiança mínima do detector pra apagar um objeto. Ver `DEFAULT_MIN_CONFIDENCE`. */
  minConfidence?: number;
}

/** Preprocessamento do YOLOX — os mesmos números de `ObjectDetectCapability`. */
const YOLOX_INPUT_SIZE = 416;
const YOLOX_NUM_PREDICTIONS = 3549; // 52² + 26² + 13² para input 416 (strides 8/16/32)
const YOLOX_IOU_THRESHOLD = 0.45;

/**
 * Confiança mínima pra APAGAR um objeto — bem acima dos 0,3 que
 * `object.detect` usa pra *listar*.
 *
 * A assimetria é proposital: errar listando é um item a mais numa lista;
 * errar apagando é um buraco no vídeo do cliente. Na dúvida sobre o que a
 * coisa é, o certo é deixar quieto.
 */
const DEFAULT_MIN_CONFIDENCE = 0.5;

/**
 * Objeto maior que isto (fração do quadro) não é apagado por mais que o
 * detector tenha certeza. Um "livro" ocupando meio quadro é quase sempre
 * classificação errada de uma superfície grande — e um erro desse tamanho é
 * exatamente o que arruína a cena.
 */
const MAX_OBJECT_AREA_RATIO = 0.15;

/** Resolução em que o LaMa roda. 128 ≈ 346ms/inferência; 256 ≈ 979ms (medido). */
const INFERENCE_SIZE = 128;
/** Contexto ao redor do objeto — o modelo precisa de vizinhança pra inventar algo plausível. */
const CONTEXT_MARGIN_RATIO = 0.25;
/**
 * Quantos pixels do vídeo original uma janela de inferência pode cobrir, em
 * múltiplos de `INFERENCE_SIZE`.
 *
 * **Este limite é a correção de um defeito real.** Uma versão anterior
 * recortava a UNIÃO de tudo que ia ser removido — que, com os alvos
 * espalhados pelo quadro, dava 90–100% do quadro. Encolher o quadro inteiro
 * pra 128px e ampliar de volta transforma a região em papa ampliada de uma
 * miniatura; num vídeo 1080p, ampliação de ~15x.
 *
 * Com 2,5, uma janela cobre no máximo 320px de origem — perda de nitidez
 * comparável a um desfoque leve, não a destruição da imagem.
 */
const MAX_WINDOW_SCALE = 2.5;

/** Objetos removidos por quadro. Cada um custa ~346ms de LaMa. */
const DEFAULT_MAX_PATCHES_PER_FRAME = 2;

/** Suaviza a borda do remendo — sem isso o retângulo reconstruído fica com costura visível. */
const FEATHER_PX = 6;

/**
 * Remove objetos soltos QUADRO A QUADRO, gerando um vídeo novo.
 *
 * ## Por que quadro a quadro
 *
 * O caminho antigo gerava UM remendo a partir de um único quadro e o colava,
 * parado, sobre a cena inteira. Isso só funciona com câmera imóvel — e vídeo
 * de imóvel real é alguém caminhando pela casa. Medido num caso real:
 * pontuação de movimento 16,2 contra um limiar de 12, ou seja, praticamente
 * toda cena caía no borrão (`delogo`) e a bagunça continuava lá.
 *
 * ## Por que detecção SEMÂNTICA e não anomalia de textura
 *
 * A primeira versão desta classe procurava "regiões que destoam" (Sobel +
 * estatística robusta). Testada nos vídeos reais, ela **borrou a coifa,
 * apagou o lustre e a planta, e sujou o backsplash** — em cômodos que não
 * tinham bagunça nenhuma.
 *
 * O motivo é estrutural, não de calibragem: anomalia de textura significa,
 * na prática, "o que não for parede lisa". Num vídeo imobiliário isso é a
 * mobília e os acabamentos, exatamente o que vende o imóvel. Um limiar
 * nenhum conserta isso, porque o algoritmo não sabe *o que* a coisa é.
 *
 * Agora quem decide é o YOLOX (as mesmas 80 classes do COCO já usadas por
 * `object.detect`), e só as classes de `removableForCleaning.ts` podem ser
 * apagadas: louça, comida, pertences, eletrônicos de mão. Móvel,
 * eletrodoméstico, pessoa, animal e decoração que valoriza (planta, vaso,
 * TV) nunca são tocados.
 *
 * Limitação honesta: pilha de roupa no chão não tem classe no COCO, então
 * não é removida. Em compensação, o pior caso deixou de ser "estraga o
 * vídeo" e passou a ser "não remove tudo".
 *
 * ## Streaming
 *
 * ffmpeg -> stdin/stdout -> ffmpeg: nada de despejar milhares de PNGs no
 * disco. Um quadro 1080p tem ~6MB; em fluxo, a memória fica constante.
 */
export class FrameByFrameCleaner implements ClutterCleaner {
  private session: ort.InferenceSession | null = null;
  private detector: ort.InferenceSession | null = null;

  constructor(
    private readonly modelPath: string,
    private readonly detectorPath: string,
    private readonly options: FrameByFrameCleanerOptions = {},
  ) {}

  isAvailable(): boolean {
    // Os dois são obrigatórios: sem o detector não há como saber o que pode
    // ser apagado, e apagar sem saber foi justamente o erro anterior.
    return existsSync(this.modelPath) && existsSync(this.detectorPath);
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

  private async ensureDetector(): Promise<ort.InferenceSession> {
    this.detector ??= await ort.InferenceSession.create(this.detectorPath);
    return this.detector;
  }

  /** Objetos removíveis neste quadro, do maior pro menor (o mais visível primeiro). */
  private async detectRemovable(
    detector: ort.InferenceSession,
    frame: Buffer,
    width: number,
    height: number,
  ): Promise<Box[]> {
    const { buffer, ratio } = letterboxRgbFrame(frame, width, height, YOLOX_INPUT_SIZE);
    const result = await detector.run({
      [detector.inputNames[0] as string]: new ort.Tensor(
        "float32",
        bgr24ToYoloxTensor(buffer, YOLOX_INPUT_SIZE),
        [1, 3, YOLOX_INPUT_SIZE, YOLOX_INPUT_SIZE],
      ),
    });

    const minConfidence = this.options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    const detections = nonMaxSuppression(
      decodeYoloxOutput(
        result[detector.outputNames[0] as string]?.data as Float32Array,
        YOLOX_NUM_PREDICTIONS,
        COCO_CLASSES.length,
        YOLOX_INPUT_SIZE,
        ratio,
        minConfidence,
      ),
      YOLOX_IOU_THRESHOLD,
    );

    const frameArea = width * height;
    return detections
      .filter((detection) =>
        isRemovableForCleaning(COCO_CLASSES[detection.classIndex] as CocoClass),
      )
      .map((detection) => {
        const [x1, y1, x2, y2] = detection.box;
        return {
          x: Math.max(0, Math.round(x1 as number)),
          y: Math.max(0, Math.round(y1 as number)),
          width: Math.round((x2 as number) - (x1 as number)),
          height: Math.round((y2 as number) - (y1 as number)),
        };
      })
      .filter(
        (box) =>
          box.width > 0 &&
          box.height > 0 &&
          (box.width * box.height) / frameArea <= MAX_OBJECT_AREA_RATIO,
      )
      .sort((a, b) => b.width * b.height - a.width * a.height);
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
    const detector = await this.ensureDetector();

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
          const { buffer, changed } = await this.cleanFrame(session, detector, frame, width, height);
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

  /** Detecta e apaga os objetos removíveis de UM quadro. Devolve o quadro (alterado ou não). */
  private async cleanFrame(
    session: ort.InferenceSession,
    detector: ort.InferenceSession,
    frame: Buffer,
    width: number,
    height: number,
  ): Promise<{ buffer: Buffer; changed: boolean }> {
    const objects = await this.detectRemovable(detector, frame, width, height);
    if (objects.length === 0) return { buffer: frame, changed: false };
    return {
      buffer: await this.eraseBoxes(session, frame, width, height, objects),
      changed: true,
    };
  }

  /**
   * Apaga caixas conhecidas de um quadro, reconstruindo o fundo com o LaMa.
   *
   * Separado de `cleanFrame` de propósito: aqui mora o código que de fato
   * altera pixel, e ele precisa ser exercitável sem depender do detector
   * acertar uma classe específica num vídeo de teste.
   */
  async eraseBoxes(
    session: ort.InferenceSession,
    frame: Buffer,
    width: number,
    height: number,
    boxes: Box[],
  ): Promise<Buffer> {
    // Agrupa objetos vizinhos numa janela só quando eles cabem juntos — dois
    // copos lado a lado saem por uma inferência, não duas.
    const maxWindowSide = Math.round(INFERENCE_SIZE * MAX_WINDOW_SCALE);
    const clusters = clusterRegions(boxes, maxWindowSide).slice(
      0,
      this.options.maxPatchesPerFrame ?? DEFAULT_MAX_PATCHES_PER_FRAME,
    );

    const output = Buffer.from(frame);
    for (const cluster of clusters) {
      // Janela QUADRADA. Uma versão anterior enfiava um recorte 320x215 num
      // quadrado 128x128 — 49% de esmagamento horizontal, devolvido esticado.
      // O modelo via geometria distorcida e devolvia conteúdo distorcido.
      const window = squareWindow(cluster.box, width, height, maxWindowSide);
      const crop = cropRgb(frame, width, window);
      const small = resizeRgb(crop, window.width, window.height, INFERENCE_SIZE, INFERENCE_SIZE);
      const mask = buildMask(cluster.regions, window, INFERENCE_SIZE);

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
      const backToCrop = resizeRgb(
        painted,
        INFERENCE_SIZE,
        INFERENCE_SIZE,
        window.width,
        window.height,
      );

      compositeRegions(output, frame, width, height, backToCrop, window, cluster.regions);
    }
    return output;
  }

  /** Sessão do LaMa, pra quem precisa chamar `eraseBoxes` direto (testes). */
  async openInpaintingSession(): Promise<ort.InferenceSession> {
    return this.ensureSession();
  }
}

interface RegionCluster {
  box: Box;
  regions: Box[];
}

/**
 * Agrupa objetos vizinhos em conjuntos cuja caixa envolvente ainda cabe numa
 * janela de `maxSide`. Guloso, começando pelos maiores.
 *
 * O ponto é nunca produzir uma janela do tamanho do quadro: encolher o quadro
 * inteiro pra 128px e ampliar de volta transforma a região em papa. Objeto
 * pequeno com muito contexto ao redor é exatamente o regime em que o LaMa
 * funciona bem.
 */
function clusterRegions(regions: Box[], maxSide: number): RegionCluster[] {
  const pending = [...regions];
  const clusters: RegionCluster[] = [];

  while (pending.length > 0) {
    const seed = pending.shift() as Box;
    const members = [seed];
    let box: Box = { ...seed };

    for (let i = pending.length - 1; i >= 0; i--) {
      const candidate = pending[i] as Box;
      const merged = boundingBox([box, candidate]);
      if (merged.width <= maxSide && merged.height <= maxSide) {
        box = merged;
        members.push(candidate);
        pending.splice(i, 1);
      }
    }

    clusters.push({ box, regions: members });
  }

  return clusters;
}

function boundingBox(boxes: Box[]): Box {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Janela quadrada com margem de contexto, deslocada pra caber no quadro.
 *
 * Quadrada porque o destino é um tensor 128x128: qualquer outra proporção
 * teria que ser esmagada pra entrar, e o modelo devolveria a distorção junto
 * com o preenchimento.
 */
function squareWindow(box: Box, frameWidth: number, frameHeight: number, maxSide: number): Box {
  const margin = Math.round(Math.max(box.width, box.height) * CONTEXT_MARGIN_RATIO);
  const side = Math.min(
    Math.max(box.width, box.height) + margin * 2,
    maxSide,
    frameWidth,
    frameHeight,
  );

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  // `clamp` mantém a janela dentro do quadro sem encolher o lado — deslocar é
  // melhor que recortar, porque um lado menor significaria menos contexto.
  const x = Math.round(Math.min(Math.max(0, centerX - side / 2), frameWidth - side));
  const y = Math.round(Math.min(Math.max(0, centerY - side / 2), frameHeight - side));
  return { x, y, width: Math.round(side), height: Math.round(side) };
}

/**
 * Compõe o resultado só dentro das regiões, desvanecendo nas bordas.
 *
 * Sem o desvanecimento a transição entre pixel reconstruído e pixel original
 * é uma linha reta e dura — o remendo se anuncia como um retângulo colado,
 * que é justamente o que se quer evitar.
 */
function compositeRegions(
  output: Buffer,
  original: Buffer,
  frameWidth: number,
  frameHeight: number,
  patch: Buffer,
  window: Box,
  regions: Box[],
): void {
  for (const region of regions) {
    const x0 = Math.max(0, region.x);
    const y0 = Math.max(0, region.y);
    const x1 = Math.min(frameWidth, region.x + region.width);
    const y1 = Math.min(frameHeight, region.y + region.height);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const insideX = Math.min(x - region.x, region.x + region.width - 1 - x);
        const insideY = Math.min(y - region.y, region.y + region.height - 1 - y);
        const alpha = Math.min(1, Math.min(insideX, insideY) / FEATHER_PX);
        if (alpha <= 0) continue;

        const from = ((y - window.y) * window.width + (x - window.x)) * 3;
        if (from < 0 || from + 2 >= patch.length) continue;
        const to = (y * frameWidth + x) * 3;
        for (let channel = 0; channel < 3; channel++) {
          const painted = patch[from + channel] as number;
          const source = original[to + channel] as number;
          output[to + channel] = Math.round(painted * alpha + source * (1 - alpha));
        }
      }
    }
  }
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
