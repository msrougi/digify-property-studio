import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTiltedTestVideo } from "../../../test-support/generateTiltedTestVideo.js";
import { extractGrayscaleFrame } from "../../ffmpeg/extractGrayscaleFrame.js";
import { detectSobelEdges } from "../sobelEdges.js";
import { detectHorizonTilt } from "../houghHorizonDetect.js";

describe("detectHorizonTilt (Sobel + Hough contra ground truth real gerado via FFmpeg)", () => {
  it.each([0, 10, -20])(
    "recupera exatamente %s° de inclinação a partir de uma borda reta real conhecida",
    async (expectedTilt) => {
      const dir = mkdtempSync(join(tmpdir(), "digify-horizon-"));
      const videoPath = join(dir, `tilt-${expectedTilt}.mp4`);
      await generateTiltedTestVideo(videoPath, expectedTilt, { width: 320, height: 240 });

      const frame = await extractGrayscaleFrame(videoPath, 500, 320, 240);
      const edges = detectSobelEdges(frame.buffer, frame.width, frame.height);
      const result = detectHorizonTilt(edges, frame.width, frame.height);

      expect(result).not.toBeNull();
      expect(result?.tiltDegrees).toBe(expectedTilt);
      expect(result?.peakStrength).toBeGreaterThan(0.3);
    },
  );

  it("retorna null quando não há bordas (frame completamente uniforme)", () => {
    const emptyBuffer = Buffer.alloc(100 * 100, 128);
    const edges = detectSobelEdges(emptyBuffer, 100, 100);
    expect(edges).toHaveLength(0);
    expect(detectHorizonTilt(edges, 100, 100)).toBeNull();
  });
});
