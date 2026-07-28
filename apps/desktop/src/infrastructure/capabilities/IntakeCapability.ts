import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";

export interface IntakeInput {
  filePath: string;
}

export interface IntakeOutput {
  sourceVideoHash: string;
  sizeBytes: number;
  fileName: string;
}

/**
 * Capability `intake` — docs/CAPABILITY_REGISTRY.md.
 *
 * Nesta fase implementa apenas hash + metadados de arquivo (determinístico,
 * confidence sempre 100). Extração de codec/fps/HDR/resolução via ffprobe é um
 * capability seguinte — não implementado ainda (docs/00-ARCHITECTURE.md, seção 3:
 * toda capability nasce atrás de uma interface estável para o modelo/ferramenta
 * real entrar depois sem redesenho).
 */
export class IntakeCapability implements Capability<IntakeInput, IntakeOutput> {
  readonly id = "intake";
  readonly layer = "intake" as const;
  readonly mutatesMedia = false;

  async execute(input: IntakeInput): Promise<CapabilityResult<IntakeOutput>> {
    const stats = statSync(input.filePath);
    const sourceVideoHash = await this.hashFile(input.filePath);

    return {
      output: {
        sourceVideoHash,
        sizeBytes: stats.size,
        fileName: basename(input.filePath),
      },
      confidence: Confidence.of(100),
    };
  }

  private hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }
}
