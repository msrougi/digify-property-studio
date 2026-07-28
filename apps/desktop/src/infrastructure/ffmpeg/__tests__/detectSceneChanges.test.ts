import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { detectSceneChangeTimestampsMs } from "../detectSceneChanges.js";

describe("detectSceneChangeTimestampsMs", () => {
  it("detecta um corte real de cena entre dois segmentos de cor bem distintos", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-scene-"));
    const outputPath = join(dir, "two-scenes.mp4");

    await generateTestVideo(outputPath, [
      { color: "red", durationSec: 2 },
      { color: "blue", durationSec: 2 },
    ]);

    const timestampsMs = await detectSceneChangeTimestampsMs(outputPath);

    expect(timestampsMs.length).toBeGreaterThanOrEqual(1);
    const cut = timestampsMs[0] ?? 0;
    // O corte acontece perto dos 2s (fronteira entre os segmentos), com tolerância.
    expect(cut).toBeGreaterThan(1000);
    expect(cut).toBeLessThan(3000);
  });

  it("não detecta cortes em um vídeo de cor única (uma cena só)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-scene-single-"));
    const outputPath = join(dir, "one-scene.mp4");

    await generateTestVideo(outputPath, [{ color: "green", durationSec: 2 }]);

    const timestampsMs = await detectSceneChangeTimestampsMs(outputPath);

    expect(timestampsMs).toHaveLength(0);
  });
});
