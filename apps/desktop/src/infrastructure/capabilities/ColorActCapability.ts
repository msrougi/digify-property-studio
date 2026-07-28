import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";

/**
 * Subconjunto implementado dos perfis documentados em
 * docs/reference/original-docs/09 - AI Color (dentro de 08 - AI Agents.md).
 * Os demais (Modern, Industrial, Beach, Scandinavian, Corporate) ficam para
 * quando houver validação visual real de cada um — melhor entregar 3 corretos
 * do que 8 arbitrários.
 */
export type ColorProfile = "warm" | "minimal" | "luxury";

export interface ColorActInput {
  profile: ColorProfile;
}

export interface ColorActOutput {
  ffmpegFilter: string;
  description: string;
}

const PROFILE_FILTERS: Record<ColorProfile, ColorActOutput> = {
  warm: {
    ffmpegFilter: "eq=saturation=1.1,colorbalance=rs=0.10:gs=0.0:bs=-0.10",
    description: "Perfil Warm — tons quentes, acolhedor.",
  },
  minimal: {
    ffmpegFilter: "eq=saturation=0.85:contrast=1.05",
    description: "Perfil Minimal — clean, discreto, dessaturado.",
  },
  luxury: {
    ffmpegFilter: "eq=contrast=1.15:saturation=1.05,colorbalance=rs=0.02:bs=0.05",
    description: "Perfil Luxury — contraste elevado, tons levemente frios, sofisticado.",
  },
};

/**
 * Capability `color.act` — docs/CAPABILITY_REGISTRY.md, Production Layer.
 * Decide o filtro de color grading por perfil. Não executa ffmpeg (o Rendering
 * Engine executa) e não é um modelo de IA — é um mapeamento determinístico de
 * perfil → parâmetros, por isso confidence sempre 100.
 */
export class ColorActCapability implements Capability<ColorActInput, ColorActOutput> {
  readonly id = "color.act";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  async execute(input: ColorActInput): Promise<CapabilityResult<ColorActOutput>> {
    const output = PROFILE_FILTERS[input.profile];
    return { output, confidence: Confidence.of(100) };
  }
}
