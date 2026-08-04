import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { detectCameraMotion } from "../detectCameraMotion.js";

describe("detectCameraMotion", () => {
  it("reconhece uma cena estática (cor sólida a cena inteira) como isStatic=true", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-motion-static-"));
    const videoPath = join(dir, "estatico.mp4");
    await generateTestVideo(videoPath, [{ color: "gray", durationSec: 2 }], { size: "64x64" });

    const result = await detectCameraMotion(videoPath, 0, 2000, 64, 64);

    expect(result.isStatic).toBe(true);
    expect(result.motionScore).toBeLessThan(5);
  });

  it("reconhece uma cena com troca completa de conteúdo (proxy real pra movimento de câmera) como isStatic=false", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-motion-moving-"));
    const videoPath = join(dir, "movimento.mp4");
    await generateTestVideo(
      videoPath,
      [
        { color: "black", durationSec: 1 },
        { color: "white", durationSec: 1 },
      ],
      { size: "64x64" },
    );

    const result = await detectCameraMotion(videoPath, 0, 2000, 64, 64);

    expect(result.isStatic).toBe(false);
    expect(result.motionScore).toBeGreaterThan(100);
  });
});
