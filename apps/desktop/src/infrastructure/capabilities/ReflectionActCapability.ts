import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractRgbFrame } from "../ffmpeg/extractRgbFrame.js";
import { writeRgbToPng } from "../ffmpeg/writeRgbToPng.js";
import { suppressReflectionRgb } from "../vision/reflectionSuppress.js";
import type { ReflectionAnalyzeOutput } from "./ReflectionAnalyzeCapability.js";

export interface ReflectionActInput extends ReflectionAnalyzeOutput {
  filePath: string;
  atMs: number;
  frameWidth: number;
  frameHeight: number;
  sceneStartMs: number;
  sceneEndMs: number;
}

export interface ReflectionOverlay {
  imagePath: string;
  x: number;
  y: number;
  /** Overlay é gerado numa resolução reduzida (custo do solver) — o Rendering Engine escala pra este tamanho (a resolução real do frame) ao compor. */
  width: number;
  height: number;
  startSec: number;
  endSec: number;
}

export interface ReflectionActOutput {
  /** null quando não havia conteúdo suprimível o bastante (abaixo do limiar). */
  overlay: ReflectionOverlay | null;
  description: string;
}

/** Resolução de trabalho pra correção final — mais alta que a análise, mas ainda limitada pelo custo não-linear do solver (ver docs/vision/REFLECTION.md, seção de performance). */
const ACT_MAX_WIDTH = 960;
/** Abaixo disso, `reflection.analyze` não achou praticamente nada suprimível — não vale gerar overlay. */
const MIN_CHANGE_THRESHOLD = 0.003;

/**
 * Capability `reflection.act` — docs/CAPABILITY_REGISTRY.md, Production
 * Layer. Roda de novo o algoritmo real de supressão de reflexo
 * (`../vision/reflectionSuppress.ts`), agora numa resolução maior, pra
 * gerar o overlay de imagem completo que cobre o frame inteiro da cena
 * (correção global, não localizada num objeto — diferente do
 * `home_staging.act`, que atua só na região de um item detectado).
 *
 * Sempre pede confirmação (nunca auto-executa) — é uma correção de conteúdo
 * visível em toda a cena, mesma lógica de `perspective.act`/
 * `home_staging.act`.
 */
export class ReflectionActCapability
  implements Capability<ReflectionActInput, ReflectionActOutput>
{
  readonly id = "reflection.act";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  constructor(private readonly patchesDir: string = tmpdir()) {}

  async execute(input: ReflectionActInput): Promise<CapabilityResult<ReflectionActOutput>> {
    if (input.meanAbsoluteChange < MIN_CHANGE_THRESHOLD) {
      return {
        output: {
          overlay: null,
          description: "Nenhum reflexo/brilho difuso perceptível pra reduzir nesta cena.",
        },
        confidence: Confidence.of(100),
      };
    }

    const frame = await extractRgbFrame(
      input.filePath,
      input.atMs,
      input.frameWidth,
      input.frameHeight,
      ACT_MAX_WIDTH,
    );
    const { buffer, meanAbsoluteChange } = suppressReflectionRgb(frame.buffer, frame.width, frame.height);

    const patchPath = join(this.patchesDir, `reflection-${randomUUID()}.png`);
    await writeRgbToPng(buffer, frame.width, frame.height, patchPath);

    return {
      output: {
        overlay: {
          imagePath: patchPath,
          x: 0,
          y: 0,
          width: input.frameWidth,
          height: input.frameHeight,
          startSec: input.sceneStartMs / 1000,
          endSec: input.sceneEndMs / 1000,
        },
        description: `Reflexo/brilho difuso reduzido (ajuste médio de ${(meanAbsoluteChange * 100).toFixed(1)}% por pixel).`,
      },
      // Correção global de imagem, sempre invasiva o bastante pra exigir
      // confirmação, mesmo com sinal forte (mesma lógica de perspective.act).
      confidence: Confidence.of(70),
    };
  }
}
