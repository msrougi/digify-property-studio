import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTiltedTestVideo } from "../../../test-support/generateTiltedTestVideo.js";
import { PerspectiveAnalyzeCapability } from "../PerspectiveAnalyzeCapability.js";

describe("PerspectiveAnalyzeCapability", () => {
  it("detecta uma inclinação real de 10° com confidence alta", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-perspective-analyze-"));
    const videoPath = join(dir, "tilt-10.mp4");
    await generateTiltedTestVideo(videoPath, 10, { width: 320, height: 240 });

    const result = await new PerspectiveAnalyzeCapability().execute({
      filePath: videoPath,
      atMs: 500,
      frameWidth: 320,
      frameHeight: 240,
    });

    expect(result.output.tiltDegrees).toBe(10);
    expect(result.confidence.value).toBeGreaterThan(70);
  });

  it("reconhece um vídeo já nivelado (0°)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-perspective-level-"));
    const videoPath = join(dir, "level.mp4");
    await generateTiltedTestVideo(videoPath, 0, { width: 320, height: 240 });

    const result = await new PerspectiveAnalyzeCapability().execute({
      filePath: videoPath,
      atMs: 500,
      frameWidth: 320,
      frameHeight: 240,
    });

    expect(result.output.tiltDegrees).toBe(0);
  });
});
