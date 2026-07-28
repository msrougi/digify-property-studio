import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateVerticalTiltedTestVideo } from "../../../test-support/generateVerticalTiltedTestVideo.js";
import { extractGrayscaleFrame } from "../../ffmpeg/extractGrayscaleFrame.js";
import { detectSobelEdges } from "../sobelEdges.js";
import { detectVerticalTilt } from "../houghVerticalDetect.js";

describe("detectVerticalTilt (Sobel + Hough contra ground truth real gerado via FFmpeg)", () => {
  it.each([0, 8, -12])(
    "recupera exatamente %s° de inclinação a partir de uma borda vertical real conhecida",
    async (expectedTilt) => {
      const dir = mkdtempSync(join(tmpdir(), "digify-vertical-"));
      const videoPath = join(dir, `vtilt-${expectedTilt}.mp4`);
      await generateVerticalTiltedTestVideo(videoPath, expectedTilt, { width: 320, height: 240 });

      const frame = await extractGrayscaleFrame(videoPath, 500, 320, 240);
      const edges = detectSobelEdges(frame.buffer, frame.width, frame.height);
      const result = detectVerticalTilt(edges, frame.width, frame.height);

      expect(result).not.toBeNull();
      expect(result?.tiltDegrees).toBe(expectedTilt);
      expect(result?.peakStrength).toBeGreaterThan(0.3);
    },
  );

  it("uma borda horizontal não é confundida com vertical (peakStrength baixo na faixa vertical)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-vertical-negcase-"));
    const videoPath = join(dir, "horizontal.mp4");
    // gera uma borda horizontal pura (0° na convenção do detector de horizonte)
    const { generateTiltedTestVideo } = await import(
      "../../../test-support/generateTiltedTestVideo.js"
    );
    await generateTiltedTestVideo(videoPath, 0, { width: 320, height: 240 });

    const frame = await extractGrayscaleFrame(videoPath, 500, 320, 240);
    const edges = detectSobelEdges(frame.buffer, frame.width, frame.height);
    const result = detectVerticalTilt(edges, frame.width, frame.height);

    // a borda é horizontal; dentro da faixa de busca vertical (±45°) o pico
    // encontrado é bem mais fraco que o de uma borda realmente vertical.
    expect(result?.peakStrength ?? 0).toBeLessThan(0.2);
  });
});
