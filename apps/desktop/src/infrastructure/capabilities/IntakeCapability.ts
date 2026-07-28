import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { readVideoMetadata, type VideoMetadata } from "../ffmpeg/ffprobeMetadata.js";

export interface IntakeInput {
  filePath: string;
}

export interface IntakeOutput extends VideoMetadata {
  sourceVideoHash: string;
  fileName: string;
}

/**
 * Capability `intake` — docs/CAPABILITY_REGISTRY.md.
 *
 * Hash SHA-256 + metadados reais de vídeo via FFprobe (duração, resolução, fps,
 * codec, áudio). Determinístico, confidence sempre 100.
 */
export class IntakeCapability implements Capability<IntakeInput, IntakeOutput> {
  readonly id = "intake";
  readonly layer = "intake" as const;
  readonly mutatesMedia = false;

  async execute(input: IntakeInput): Promise<CapabilityResult<IntakeOutput>> {
    const [sourceVideoHash, metadata] = await Promise.all([
      this.hashFile(input.filePath),
      readVideoMetadata(input.filePath),
    ]);

    return {
      output: {
        ...metadata,
        sourceVideoHash,
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
