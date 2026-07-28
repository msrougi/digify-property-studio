import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { computeSafeCropAfterRotation } from "../vision/rotatedRectCrop.js";
import type { PerspectiveAnalyzeOutput } from "./PerspectiveAnalyzeCapability.js";

export interface PerspectiveActInput extends PerspectiveAnalyzeOutput {
  frameWidth: number;
  frameHeight: number;
}

export interface PerspectiveActOutput {
  /** null quando nenhuma correção é aplicada (já nivelado/reto ou sinal não confiável). */
  ffmpegFilter: string | null;
  needsCorrection: boolean;
  description: string;
}

/** Abaixo disso, a diferença é imperceptível — corrigir só introduziria recorte desnecessário. */
const TILT_THRESHOLD_DEGREES = 1.5;
/** Clampa a correção — ângulos maiores geralmente indicam detecção errada, não câmera realmente torta. */
const MAX_CORRECTION_DEGREES = 8;
/** Abaixo disso, `perspective.analyze` não tinha uma linha dominante clara — não arriscamos corrigir. */
const MIN_RELIABLE_PEAK_STRENGTH = 0.1;
/** Mesmo limite usado na busca de `detectLensDistortion.ts` — defesa em profundidade, o valor já vem clampado de lá. */
const MAX_LENS_CORRECTION_K1 = 0.35;

/**
 * Capability `perspective.act` — docs/CAPABILITY_REGISTRY.md, Production
 * Layer. Decide o(s) filtro(s) FFmpeg que corrigem horizonte, linhas
 * verticais E distorção de lente grande angular a partir de
 * `perspective.analyze` (não executa — quem executa é o Rendering Engine).
 *
 * Três correções independentes (cada uma só dispara se seu próprio sinal
 * for confiável), concatenadas na mesma cadeia de filtros quando mais de uma
 * se aplica:
 * 1. **Distorção de lente (barril)** — aplica o `k1` de correção já
 *    encontrado por busca real em `detectLensDistortion.ts` via o filtro
 *    `lenscorrection` do próprio FFmpeg. Sempre primeiro na cadeia: as
 *    outras duas correções assumem uma câmera já aproximadamente linear.
 *    Não precisa de recorte depois — verificado empiricamente que corrigir
 *    distorção de barril com `k1` negativo nunca deixa cantos pretos (a
 *    reamostragem sempre fica dentro dos limites da imagem de entrada).
 * 2. **Horizonte** — rotaciona (`../vision/rotatedRectCrop.ts`, "maior
 *    retângulo inscrito após rotação") + recorte seguro + reescala.
 * 3. **Linhas verticais** — corrige o keystone/convergência via
 *    cisalhamento horizontal real (filtro `perspective` do FFmpeg,
 *    deslocando a amostragem do topo em relação à base pela quantidade
 *    detectada), recortando a faixa de colunas que fica sem cantos pretos
 *    depois do cisalhamento (derivação geométrica simples: largura segura =
 *    largura - |deslocamento em pixels|) + reescala.
 *
 * As três são verificadas em loop fechado — aplica a correção sobre um
 * vídeo sintético com distorção/inclinação conhecida e confirma que rodar a
 * mesma detecção real de novo no resultado dá ~0°/sem ganho adicional
 * (`RenderingEngine.test.ts`).
 *
 * A correção de linhas verticais é uma aproximação (assume cisalhamento
 * uniforme a partir de uma única linha representativa, não uma estimativa
 * de ponto de fuga com múltiplas linhas) e a de lente busca `k1` só num
 * conjunto discreto de candidatos (não resolve o valor exato por otimização
 * contínua) — documentado como simplificação honesta em
 * `docs/vision/PERSPECTIVE.md`.
 */
export class PerspectiveActCapability
  implements Capability<PerspectiveActInput, PerspectiveActOutput>
{
  readonly id = "perspective.act";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  async execute(input: PerspectiveActInput): Promise<CapabilityResult<PerspectiveActOutput>> {
    const horizonReliable = input.peakStrength >= MIN_RELIABLE_PEAK_STRENGTH;
    const verticalReliable = input.verticalPeakStrength >= MIN_RELIABLE_PEAK_STRENGTH;

    const needsHorizonFix = horizonReliable && Math.abs(input.tiltDegrees) >= TILT_THRESHOLD_DEGREES;
    const needsVerticalFix =
      verticalReliable && Math.abs(input.verticalTiltDegrees) >= TILT_THRESHOLD_DEGREES;
    // já vem pré-validado por detectLensDistortion.ts (busca real que só retorna k1 != 0 quando a correção de fato melhora o ajuste da linha reta).
    const needsLensFix = input.lensDistortionK1 !== 0;

    if (!needsHorizonFix && !needsVerticalFix && !needsLensFix) {
      const reliable = horizonReliable || verticalReliable;
      return {
        output: {
          ffmpegFilter: null,
          needsCorrection: false,
          description: reliable
            ? "Horizonte e linhas verticais já estão corretos — nenhuma correção necessária."
            : "Não encontramos linhas de referência confiáveis nesta cena — nenhuma correção aplicada.",
        },
        confidence: Confidence.of(reliable ? 100 : 40),
      };
    }

    const filters: string[] = [];
    const descriptionParts: string[] = [];

    if (needsLensFix) {
      // Corrige a distorção geométrica de baixo nível (por-pixel) ANTES das
      // correções de horizonte/verticais, que assumem uma câmera já
      // aproximadamente linear (sem isso, rotate/perspective operariam
      // sobre linhas ainda curvas).
      const clampedK1 = clamp(input.lensDistortionK1, MAX_LENS_CORRECTION_K1);
      filters.push(`lenscorrection=k1=${clampedK1.toFixed(4)}:k2=0:i=bilinear`);
      descriptionParts.push("distorção de lente grande angular corrigida");
    }

    if (needsHorizonFix) {
      const clampedTilt = clamp(input.tiltDegrees, MAX_CORRECTION_DEGREES);
      const correctionRadians = (-clampedTilt * Math.PI) / 180;

      const crop = computeSafeCropAfterRotation(
        input.frameWidth,
        input.frameHeight,
        correctionRadians,
      );
      const cropWidth = Math.max(2, Math.floor(crop.width / 2) * 2);
      const cropHeight = Math.max(2, Math.floor(crop.height / 2) * 2);
      const cropX = Math.floor((input.frameWidth - cropWidth) / 2);
      const cropY = Math.floor((input.frameHeight - cropHeight) / 2);

      filters.push(
        `rotate=${correctionRadians.toFixed(6)}:fillcolor=black`,
        `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`,
        `scale=${input.frameWidth}:${input.frameHeight}`,
      );

      const direction = clampedTilt > 0 ? "sentido horário" : "sentido anti-horário";
      descriptionParts.push(`horizonte corrigido em ${Math.abs(clampedTilt).toFixed(1)}° (${direction})`);
    }

    if (needsVerticalFix) {
      const clampedTilt = clamp(input.verticalTiltDegrees, MAX_CORRECTION_DEGREES);
      const shearPixels = Math.round(
        -input.frameHeight * Math.tan((clampedTilt * Math.PI) / 180),
      );

      // topo amostra deslocado por shearPixels em relação à base -- "desfaz"
      // linhas verticais que hoje convergem/inclinam nessa direção.
      const x0 = shearPixels;
      const x1 = input.frameWidth + shearPixels;

      filters.push(
        `perspective=x0=${x0}:y0=0:x1=${x1}:y1=0:x2=0:y2=${input.frameHeight}:x3=${input.frameWidth}:y3=${input.frameHeight}`,
      );

      const safeWidth = Math.max(2, input.frameWidth - Math.abs(shearPixels));
      const safeX = shearPixels > 0 ? 0 : Math.abs(shearPixels);
      filters.push(
        `crop=${safeWidth}:${input.frameHeight}:${safeX}:0`,
        `scale=${input.frameWidth}:${input.frameHeight}`,
      );

      descriptionParts.push(`linhas verticais endireitadas em ${Math.abs(clampedTilt).toFixed(1)}°`);
    }

    return {
      output: {
        ffmpegFilter: filters.join(","),
        needsCorrection: true,
        description: `Perspectiva corrigida: ${descriptionParts.join(", ")}.`,
      },
      // Correção geométrica recorta bordas do frame — sempre invasiva o
      // bastante para pedir confirmação, mesmo com detecção confiável
      // (mesma lógica de gate do home_staging.act).
      confidence: Confidence.of(75),
    };
  }
}

function clamp(value: number, maxAbs: number): number {
  return Math.max(-maxAbs, Math.min(maxAbs, value));
}
