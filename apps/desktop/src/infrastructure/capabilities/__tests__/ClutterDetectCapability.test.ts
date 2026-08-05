import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateVideoWithTexturedPatch } from "../../../test-support/generateVideoWithTexturedPatch.js";
import { ClutterDetectCapability } from "../ClutterDetectCapability.js";

const SIZE = { width: 320, height: 240 };
const PATCH = { x: 150, y: 80, width: 100, height: 90 };

describe("ClutterDetectCapability", () => {
  it("detecta de verdade uma região de bagunça (textura alta) num vídeo real majoritariamente liso", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-clutter-detect-"));
    const videoPath = join(dir, "bagunca.mp4");
    await generateVideoWithTexturedPatch(videoPath, SIZE, PATCH);

    const capability = new ClutterDetectCapability();
    const result = await capability.execute({
      filePath: videoPath,
      sceneStartMs: 0,
      sceneEndMs: 1000,
      frameWidth: SIZE.width,
      frameHeight: SIZE.height,
      excludeBoxes: [],
    });

    expect(result.output.regions.length).toBeGreaterThan(0);
    const patchCenterX = PATCH.x + PATCH.width / 2;
    const patchCenterY = PATCH.y + PATCH.height / 2;
    const covers = result.output.regions.some(
      (region) =>
        region.boundingBox.x <= patchCenterX &&
        region.boundingBox.x + region.boundingBox.width >= patchCenterX &&
        region.boundingBox.y <= patchCenterY &&
        region.boundingBox.y + region.boundingBox.height >= patchCenterY,
    );
    expect(covers).toBe(true);
  }, 30_000);

  it("nunca marca uma região excluída (pessoa/móvel já detectado por object.detect) mesmo sendo texturizada", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-clutter-detect-exclude-"));
    const videoPath = join(dir, "bagunca.mp4");
    await generateVideoWithTexturedPatch(videoPath, SIZE, PATCH);

    const capability = new ClutterDetectCapability();
    const result = await capability.execute({
      filePath: videoPath,
      sceneStartMs: 0,
      sceneEndMs: 1000,
      frameWidth: SIZE.width,
      frameHeight: SIZE.height,
      excludeBoxes: [{ x: PATCH.x - 10, y: PATCH.y - 10, width: PATCH.width + 20, height: PATCH.height + 20 }],
    });

    expect(result.output.regions).toHaveLength(0);
  }, 30_000);

  it("não encontra nada num vídeo real completamente liso (nada pra destoar)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-clutter-detect-clean-"));
    const videoPath = join(dir, "limpo.mp4");
    await generateVideoWithTexturedPatch(videoPath, SIZE, { x: 0, y: 0, width: 0, height: 0 });

    const capability = new ClutterDetectCapability();
    const result = await capability.execute({
      filePath: videoPath,
      sceneStartMs: 0,
      sceneEndMs: 1000,
      frameWidth: SIZE.width,
      frameHeight: SIZE.height,
      excludeBoxes: [],
    });

    expect(result.output.regions).toHaveLength(0);
  }, 30_000);
});
