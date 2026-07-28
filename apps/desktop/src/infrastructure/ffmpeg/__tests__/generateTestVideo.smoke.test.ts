import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { readVideoMetadata } from "../ffprobeMetadata.js";

describe("generateTestVideo (test-support)", () => {
  it("gera um vídeo real de 2 segundos com dois segmentos de cor", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-fixture-"));
    const outputPath = join(dir, "fixture.mp4");

    await generateTestVideo(outputPath, [
      { color: "red", durationSec: 1 },
      { color: "blue", durationSec: 1 },
    ]);

    const metadata = await readVideoMetadata(outputPath);
    expect(metadata.durationMs).toBeGreaterThanOrEqual(1900);
    expect(metadata.durationMs).toBeLessThanOrEqual(2200);
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(64);
  });
});
