import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";

/**
 * Todos os 8 perfis documentados em docs/reference/original-docs/09 - AI Color
 * (dentro de 08 - AI Agents.md). Os originais não especificam parâmetros
 * exatos — só o nome/intenção de cada perfil — então cada filtro abaixo é uma
 * tradução nossa da intenção estética em parâmetros reais de FFmpeg
 * (`eq`/`colorbalance`), na mesma linha dos 3 primeiros (Warm/Minimal/Luxury).
 */
export type ColorProfile =
  | "warm"
  | "minimal"
  | "luxury"
  | "modern"
  | "industrial"
  | "beach"
  | "scandinavian"
  | "corporate";

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
  modern: {
    ffmpegFilter: "eq=contrast=1.12:saturation=0.95,colorbalance=rs=-0.03:bs=0.05",
    description: "Perfil Modern — contraste nítido, tons levemente frios e neutros.",
  },
  industrial: {
    ffmpegFilter: "eq=saturation=0.7:contrast=1.1,colorbalance=rs=-0.05:gs=0.02",
    description: "Perfil Industrial — dessaturado, cinza-aço, contraste elevado.",
  },
  beach: {
    ffmpegFilter: "eq=brightness=0.03:saturation=1.2,colorbalance=rs=0.08:gs=0.04:bs=-0.05",
    description: "Perfil Beach — claro, ensolarado, saturação elevada.",
  },
  scandinavian: {
    ffmpegFilter: "eq=brightness=0.04:saturation=0.8:contrast=0.98,colorbalance=bs=0.03",
    description: "Perfil Scandinavian — claro, arejado, tons neutros e suaves.",
  },
  corporate: {
    ffmpegFilter: "eq=saturation=0.9:contrast=1.08,colorbalance=rs=-0.02:bs=0.06",
    description: "Perfil Corporate — neutro, profissional, leve tom frio.",
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
