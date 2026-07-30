import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractRgbFrame } from "../ffmpeg/extractRgbFrame.js";
import { suppressReflectionRgb } from "../vision/reflectionSuppress.js";

export interface ReflectionAnalyzeInput {
  filePath: string;
  atMs: number;
  frameWidth: number;
  frameHeight: number;
}

export interface ReflectionAnalyzeOutput {
  /** Diferença média absoluta por pixel/canal (0-1) entre o frame original e o resultado do algoritmo — quanto conteúdo de baixo contraste (reflexo/brilho difuso) foi encontrado pra suprimir. */
  meanAbsoluteChange: number;
}

/** Resolução de trabalho pra análise — rápida o bastante pra rodar em toda cena sem custar segundos (ver docs/vision/REFLECTION.md). */
const ANALYZE_MAX_WIDTH = 320;

/**
 * Capability `reflection.analyze` — docs/CAPABILITY_REGISTRY.md, Vision
 * Layer. Mede um sinal real (não uma heurística de "brilho = reflexo"):
 * roda de verdade o algoritmo de supressão de reflexo
 * (`../vision/reflectionSuppress.ts`, porte do método de Yang et al., "Fast
 * Single Image Reflection Suppression via Convex Optimization", CVPR 2019 —
 * geometria/matemática clássica, resolve uma EDP via DCT, não é IA
 * treinada) numa resolução reduzida e mede o quanto a saída difere da
 * entrada.
 *
 * Importante — limitação honesta: isso NÃO é um detector de espelho/vidro
 * (não existe segmentação de superfície reflexiva aqui, ver
 * `docs/vision/REFLECTION.md` sobre por que essa parte continua sem sinal
 * real disponível). O algoritmo suprime QUALQUER gradiente fraco/difuso —
 * o que inclui reflexos reais, mas também sombras suaves, gradientes de
 * parede, etc. `meanAbsoluteChange` mede "quanto o algoritmo mudou a
 * imagem", não "tem reflexo aqui".
 */
export class ReflectionAnalyzeCapability
  implements Capability<ReflectionAnalyzeInput, ReflectionAnalyzeOutput>
{
  readonly id = "reflection.analyze";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  async execute(
    input: ReflectionAnalyzeInput,
  ): Promise<CapabilityResult<ReflectionAnalyzeOutput>> {
    const frame = await extractRgbFrame(
      input.filePath,
      input.atMs,
      input.frameWidth,
      input.frameHeight,
      ANALYZE_MAX_WIDTH,
    );
    const { meanAbsoluteChange } = suppressReflectionRgb(frame.buffer, frame.width, frame.height);

    // Escala calibrada contra vídeos de exemplo reais (bedroom/kitchen/bathroom
    // — ver docs/vision/REFLECTION.md): valores típicos ficam entre ~0.008 e
    // ~0.035, então uma mudança de 0.03 já é "bastante conteúdo suprimível".
    const confidenceValue = Math.round(Math.min(100, meanAbsoluteChange * 3000));

    return {
      output: { meanAbsoluteChange },
      confidence: Confidence.of(confidenceValue),
    };
  }
}
