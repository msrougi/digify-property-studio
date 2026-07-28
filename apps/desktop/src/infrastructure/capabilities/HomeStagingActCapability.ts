import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";

export interface TemporaryObjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Janela de tempo (ms) da cena em que o objeto foi detectado. O `delogo`
   * só pode ser aplicado enquanto essa cena está no ar — sem isso, a mesma
   * região de pixels seria borrada em cenas seguintes (câmera já mudou de
   * cômodo), removendo conteúdo que não tem nada a ver com o objeto
   * detectado.
   */
  sceneStartMs: number;
  sceneEndMs: number;
}

export interface HomeStagingActInput {
  temporaryObjects: TemporaryObjectBox[];
}

export interface HomeStagingActOutput {
  ffmpegFilters: string[];
  itemsAddressed: number;
  description: string;
}

/**
 * Capability `home_staging.act` — docs/CAPABILITY_REGISTRY.md, Production
 * Layer. Decide filtros `delogo` (interpolação da vizinhança, FFmpeg) para
 * cada objeto temporário já detectado por `object.detect`.
 *
 * IMPORTANTE — limitação honesta (não é preenchimento generativo): tentamos
 * baixar modelos de inpainting reais (LaMa, MI-GAN, Moebius) mas todos só
 * distribuem pesos via Hugging Face/Google Drive, inacessíveis neste
 * ambiente de desenvolvimento (só GitHub + PyPI/npm liberados). `delogo`
 * funciona bem para objetos pequenos sobre fundo uniforme (chão, bancada) e
 * mal para fundos complexos/padronizados — é um resultado real, mas
 * inferior a uma IA generativa de inpainting. Ver docs/ml/HOME_STAGING.md.
 */
export class HomeStagingActCapability
  implements Capability<HomeStagingActInput, HomeStagingActOutput>
{
  readonly id = "home_staging.act";
  readonly layer = "production" as const;
  readonly mutatesMedia = true;

  async execute(input: HomeStagingActInput): Promise<CapabilityResult<HomeStagingActOutput>> {
    if (input.temporaryObjects.length === 0) {
      return {
        output: { ffmpegFilters: [], itemsAddressed: 0, description: "Nenhum item temporário detectado." },
        confidence: Confidence.of(100),
      };
    }

    const ffmpegFilters = input.temporaryObjects.map((box) => {
      const x = Math.max(0, Math.round(box.x));
      const y = Math.max(0, Math.round(box.y));
      const w = Math.max(2, Math.round(box.width));
      const h = Math.max(2, Math.round(box.height));
      const startSec = Math.max(0, box.sceneStartMs / 1000);
      const endSec = Math.max(startSec, box.sceneEndMs / 1000);
      return `delogo=x=${x}:y=${y}:w=${w}:h=${h}:enable='between(t,${startSec},${endSec})'`;
    });

    return {
      output: {
        ffmpegFilters,
        itemsAddressed: input.temporaryObjects.length,
        description: `${input.temporaryObjects.length} item(ns) temporário(s) — tentativa de remoção por interpolação (não é preenchimento generativo por IA).`,
      },
      // Confidence moderada de propósito: a técnica é real mas limitada — o
      // gate de confidence (docs/00-ARCHITECTURE.md, seção 6) deve pedir
      // confirmação do usuário antes de aplicar, nunca auto-executar.
      confidence: Confidence.of(75),
    };
  }
}
