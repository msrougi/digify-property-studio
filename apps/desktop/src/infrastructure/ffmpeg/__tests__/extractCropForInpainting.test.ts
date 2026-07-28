import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { extractCropForInpainting } from "../extractCropForInpainting.js";

describe("extractCropForInpainting", () => {
  it("extrai um recorte real do vídeo com padding até múltiplo de 8", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-crop-"));
    const videoPath = join(dir, "video.mp4");
    await generateTestVideo(videoPath, [{ color: "gray", durationSec: 1 }], { size: "320x240" });

    const crop = await extractCropForInpainting(videoPath, 500, 50, 50, 100, 90);

    expect(crop.width).toBe(100);
    expect(crop.height).toBe(90);
    expect(crop.paddedWidth).toBe(104); // próximo múltiplo de 8 >= 100
    expect(crop.paddedHeight).toBe(96); // próximo múltiplo de 8 >= 90
    expect(crop.buffer.length).toBe(104 * 96 * 3);
  });

  it("recorte já múltiplo de 8 não recebe padding extra", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-crop-exact-"));
    const videoPath = join(dir, "video.mp4");
    await generateTestVideo(videoPath, [{ color: "gray", durationSec: 1 }], { size: "320x240" });

    const crop = await extractCropForInpainting(videoPath, 500, 0, 0, 64, 32);

    expect(crop.paddedWidth).toBe(64);
    expect(crop.paddedHeight).toBe(32);
  });
});
