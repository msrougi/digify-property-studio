import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as ort from "onnxruntime-node";
import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractCropForInpainting } from "../ffmpeg/extractCropForInpainting.js";
import { writeRgbToPng } from "../ffmpeg/writeRgbToPng.js";
import { computeUnionBoxWithMargin } from "../vision/unionBoxWithMargin.js";
import { rgb24ToLamaImageTensor, lamaImageTensorToRgb24, buildLamaMaskTensor } from "../ml/lama/lamaTensors.js";

export interface TemporaryObjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HomeStagingActInput {
  temporaryObjects: TemporaryObjectBox[];
  /** Janela de tempo da cena de onde os objetos vieram (ms) — usada pro overlay e, com inpainting real, também define o frame extraído. */
  sceneStartMs: number;
  sceneEndMs: number;
  filePath: string;
  /** Timestamp do frame representativo da cena (ms) — normalmente o meio da cena. */
  atMs: number;
  frameWidth: number;
  frameHeight: number;
}

export interface HomeStagingOverlay {
  imagePath: string;
  x: number;
  y: number;
  startSec: number;
  endSec: number;
}

export interface HomeStagingActOutput {
  /** Filtros `delogo` clássicos — usado só quando o modelo de inpainting real não está disponível. */
  legacyFilters: string[];
  /** Patch de inpainting real (LaMa) pronto pra compor sobre o vídeo — null quando caiu no fallback. */
  overlay: HomeStagingOverlay | null;
  itemsAddressed: number;
  usedRealInpainting: boolean;
  description: string;
}

/** Contexto extra ao redor dos objetos — o LaMa precisa de pixels de vizinhança pra gerar um preenchimento plausível. */
const CONTEXT_MARGIN_PX = 48;

/**
 * Capability `home_staging.act` — docs/CAPABILITY_REGISTRY.md, Production
 * Layer. Decide como remover objetos temporários já detectados por
 * `object.detect`.
 *
 * Dois caminhos reais, nunca simulados:
 *
 * 1. **Inpainting generativo real (LaMa)**, quando `modelPath` aponta pra um
 *    `lama_inpainting.onnx` existente: recorta a região dos objetos + margem
 *    de contexto, roda o modelo real via ONNX Runtime, e devolve um overlay
 *    (imagem PNG gerada) pra compor sobre o vídeo na janela de tempo da
 *    cena. Ver `tools/inpainting/README.md` para como o modelo foi obtido
 *    (checkpoint TorchScript real do GitHub Releases) e convertido.
 * 2. **Fallback `delogo`** (interpolação de vizinhança, FFmpeg), quando o
 *    modelo não está disponível (arquivo não versionado no git — ~196MB,
 *    acima do limite do GitHub) ou a inferência falha por qualquer motivo
 *    real — nunca quebra o render inteiro por causa disso. Documentado como
 *    limitação honesta em `docs/ml/HOME_STAGING.md`.
 */
export class HomeStagingActCapability
  implements Capability<HomeStagingActInput, HomeStagingActOutput>
{
  readonly id = "home_staging.act";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  private session: ort.InferenceSession | null = null;

  constructor(
    private readonly modelPath?: string,
    private readonly patchesDir: string = tmpdir(),
  ) {}

  private isModelAvailable(): boolean {
    return !!this.modelPath && existsSync(this.modelPath);
  }

  private async ensureSession(): Promise<ort.InferenceSession> {
    if (!this.session) {
      // graphOptimizationLevel: 'disabled' -- necessário de verdade, não é
      // cautela extra: com otimização padrão, o ONNX Runtime tem um bug real
      // de reaproveitamento de buffer nos nós DFT (Fast Fourier Convolutions
      // do LaMa), mesmo na resolução exata do trace. Ver
      // tools/inpainting/README.md, "O bug de runtime real".
      this.session = await ort.InferenceSession.create(this.modelPath as string, {
        graphOptimizationLevel: "disabled",
      });
    }
    return this.session;
  }

  async execute(input: HomeStagingActInput): Promise<CapabilityResult<HomeStagingActOutput>> {
    if (input.temporaryObjects.length === 0) {
      return {
        output: {
          legacyFilters: [],
          overlay: null,
          itemsAddressed: 0,
          usedRealInpainting: false,
          description: "Nenhum item temporário detectado.",
        },
        confidence: Confidence.of(100),
      };
    }

    if (this.isModelAvailable()) {
      try {
        return await this.executeRealInpainting(input);
      } catch (error) {
        return this.executeDelogoFallback(
          input,
          `Inpainting real falhou (${(error as Error).message}) — usando remoção por interpolação.`,
        );
      }
    }

    return this.executeDelogoFallback(input);
  }

  private async executeRealInpainting(
    input: HomeStagingActInput,
  ): Promise<CapabilityResult<HomeStagingActOutput>> {
    const union = computeUnionBoxWithMargin(
      input.temporaryObjects,
      CONTEXT_MARGIN_PX,
      input.frameWidth,
      input.frameHeight,
    );

    const crop = await extractCropForInpainting(
      input.filePath,
      input.atMs,
      union.x,
      union.y,
      union.width,
      union.height,
    );

    const imageTensor = rgb24ToLamaImageTensor(crop.buffer, crop.paddedWidth, crop.paddedHeight);
    const maskBoxes = input.temporaryObjects.map((box) => ({
      x: box.x - union.x,
      y: box.y - union.y,
      width: box.width,
      height: box.height,
    }));
    const maskTensor = buildLamaMaskTensor(maskBoxes, crop.paddedWidth, crop.paddedHeight);

    const session = await this.ensureSession();
    const imageInputName = session.inputNames[0] as string;
    const maskInputName = session.inputNames[1] as string;
    const outputName = session.outputNames[0] as string;

    const result = await session.run({
      [imageInputName]: new ort.Tensor("float32", imageTensor, [
        1,
        3,
        crop.paddedHeight,
        crop.paddedWidth,
      ]),
      [maskInputName]: new ort.Tensor("float32", maskTensor, [
        1,
        1,
        crop.paddedHeight,
        crop.paddedWidth,
      ]),
    });

    const outputTensor = result[outputName]?.data as Float32Array;
    const inpaintedPadded = lamaImageTensorToRgb24(outputTensor, crop.paddedWidth, crop.paddedHeight);
    const inpaintedCrop = cropRgb24(
      inpaintedPadded,
      crop.paddedWidth,
      crop.width,
      crop.height,
    );

    const patchPath = join(this.patchesDir, `home-staging-${randomUUID()}.png`);
    await writeRgbToPng(inpaintedCrop, crop.width, crop.height, patchPath);

    return {
      output: {
        legacyFilters: [],
        overlay: {
          imagePath: patchPath,
          x: union.x,
          y: union.y,
          startSec: input.sceneStartMs / 1000,
          endSec: input.sceneEndMs / 1000,
        },
        itemsAddressed: input.temporaryObjects.length,
        usedRealInpainting: true,
        description: `${input.temporaryObjects.length} item(ns) temporário(s) removido(s) via inpainting real (LaMa, IA generativa).`,
      },
      // Ainda pede confirmação: mesmo sendo geração real, é uma alteração
      // visível de conteúdo — o usuário sempre decide se aplica (mesma
      // lógica de `perspective.act`).
      confidence: Confidence.of(75),
    };
  }

  private executeDelogoFallback(
    input: HomeStagingActInput,
    prefixDescription?: string,
  ): CapabilityResult<HomeStagingActOutput> {
    const legacyFilters = input.temporaryObjects.map((box) => {
      const x = Math.max(0, Math.round(box.x));
      const y = Math.max(0, Math.round(box.y));
      const w = Math.max(2, Math.round(box.width));
      const h = Math.max(2, Math.round(box.height));
      const startSec = Math.max(0, input.sceneStartMs / 1000);
      const endSec = Math.max(startSec, input.sceneEndMs / 1000);
      return `delogo=x=${x}:y=${y}:w=${w}:h=${h}:enable='between(t,${startSec},${endSec})'`;
    });

    const description =
      prefixDescription ??
      `${input.temporaryObjects.length} item(ns) temporário(s) — tentativa de remoção por interpolação (não é preenchimento generativo por IA).`;

    return {
      output: {
        legacyFilters,
        overlay: null,
        itemsAddressed: input.temporaryObjects.length,
        usedRealInpainting: false,
        description,
      },
      // Confidence moderada de propósito: a técnica clássica é real mas
      // limitada — o gate de confidence (docs/00-ARCHITECTURE.md, seção 6)
      // deve pedir confirmação do usuário antes de aplicar.
      confidence: Confidence.of(75),
    };
  }
}

function cropRgb24(buffer: Buffer, sourceWidth: number, width: number, height: number): Buffer {
  const output = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row++) {
    const sourceOffset = row * sourceWidth * 3;
    const destOffset = row * width * 3;
    buffer.copy(output, destOffset, sourceOffset, sourceOffset + width * 3);
  }
  return output;
}
