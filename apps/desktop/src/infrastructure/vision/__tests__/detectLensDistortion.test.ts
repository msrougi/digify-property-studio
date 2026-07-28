import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateBarrelDistortedTestVideo } from "../../../test-support/generateBarrelDistortedTestVideo.js";
import { generateTiltedTestVideo } from "../../../test-support/generateTiltedTestVideo.js";
import { detectLensDistortion } from "../detectLensDistortion.js";

describe("detectLensDistortion (busca real de k1 sobre um vídeo com distorção de barril conhecida)", () => {
  it.each([0.2, 0.3])(
    "detecta e propõe uma correção real para distorção de barril conhecida (k1Forward=%s)",
    async (k1Forward) => {
      const dir = mkdtempSync(join(tmpdir(), "digify-lens-"));
      const videoPath = join(dir, `barrel-${k1Forward}.mp4`);
      await generateBarrelDistortedTestVideo(videoPath, k1Forward, { width: 640, height: 480 });

      const result = await detectLensDistortion(videoPath, 500, 640, 480);

      expect(result).not.toBeNull();
      expect(result?.k1).toBeLessThan(0);
      expect(result?.k1).toBeGreaterThanOrEqual(-0.35);
      expect(result?.peakStrengthGain).toBeGreaterThan(0.03);
    },
    30000,
  );

  it("não corrige um vídeo sem distorção de lente (grade reta)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-lens-flat-"));
    const videoPath = join(dir, "flat.mp4");
    // borda reta pura, sem lenscorrection nenhum aplicado
    await generateTiltedTestVideo(videoPath, 0, { width: 640, height: 480 });

    const result = await detectLensDistortion(videoPath, 500, 640, 480);

    expect(result).toBeNull();
  }, 30000);
});
