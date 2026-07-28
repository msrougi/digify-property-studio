import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import type { ExposureClassification } from "./LightingAnalyzeCapability.js";

export interface PropertyScoreInput {
  lightingClassifications: ExposureClassification[];
  temporaryObjectsCount: number;
}

export interface PropertyScoreOutput {
  score: number;
  lightingScore: number;
  organizationScore: number;
  suggestions: string[];
}

/**
 * Capability `property.score` — docs/reference/original-docs/08 - AI Agents.md,
 * "AI Property Score". Combina apenas sinais que a plataforma realmente mede
 * hoje (exposição real via `lighting.analyze`, bagunça real via
 * `object.detect`) — nunca inventa "composição"/"narrativa"/"estabilidade"
 * sem ter um sinal real por trás (docs/reference/original-docs/02 - Product
 * Manifesto.md: "a verdade sempre vence"). Determinístico, confidence 100.
 */
export class PropertyScoreCapability implements Capability<PropertyScoreInput, PropertyScoreOutput> {
  readonly id = "property.score";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  async execute(input: PropertyScoreInput): Promise<CapabilityResult<PropertyScoreOutput>> {
    const suggestions: string[] = [];

    const normalCount = input.lightingClassifications.filter((c) => c === "normal").length;
    const lightingScore =
      input.lightingClassifications.length > 0
        ? Math.round((normalCount / input.lightingClassifications.length) * 100)
        : 100;

    const badLightingCount = input.lightingClassifications.length - normalCount;
    if (badLightingCount > 0) {
      suggestions.push(
        `${badLightingCount} cena(s) com iluminação fora do ideal — considere gravar com mais luz natural ou ajustar iluminação artificial.`,
      );
    }

    const organizationScore = Math.max(0, 100 - input.temporaryObjectsCount * 15);
    if (input.temporaryObjectsCount > 0) {
      suggestions.push(
        `${input.temporaryObjectsCount} objeto(s) temporário(s) detectado(s) — remover itens pessoais antes de gravar melhora a percepção do imóvel.`,
      );
    }

    const score = Math.round((lightingScore + organizationScore) / 2);

    return {
      output: { score, lightingScore, organizationScore, suggestions },
      confidence: Confidence.of(100),
    };
  }
}
