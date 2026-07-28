import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ObjectDetectCapability } from "../ObjectDetectCapability.js";

const FIXTURES_DIR = join(__dirname, "..", "__fixtures__");
const MODEL_PATH = join(__dirname, "..", "..", "..", "..", "models", "yolox_nano.onnx");

// Fixtures geradas a partir de fotos reais (tools/room-classifier/data/), 320x240.
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;

describe("ObjectDetectCapability", () => {
  it("detecta objetos reais e plausíveis numa cozinha real (geladeira/mesa/cadeira)", async () => {
    const capability = new ObjectDetectCapability(MODEL_PATH);
    const result = await capability.execute({
      filePath: join(FIXTURES_DIR, "kitchen-sample.mp4"),
      atMs: 200,
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });

    expect(result.output.objects.length).toBeGreaterThan(0);
    const classes = result.output.objects.map((o) => o.cocoClass);
    expect(classes.some((c) => ["refrigerator", "dining table", "chair", "oven", "sink"].includes(c))).toBe(
      true,
    );
  }, 20_000);

  it("detecta objetos reais e plausíveis num banheiro real (vaso/pia)", async () => {
    const capability = new ObjectDetectCapability(MODEL_PATH);
    const result = await capability.execute({
      filePath: join(FIXTURES_DIR, "bathroom-sample.mp4"),
      atMs: 200,
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });

    const classes = result.output.objects.map((o) => o.cocoClass);
    expect(classes.some((c) => ["toilet", "sink"].includes(c))).toBe(true);
  }, 20_000);

  it("móveis fixos detectados nunca são marcados como removíveis", async () => {
    const capability = new ObjectDetectCapability(MODEL_PATH);
    const result = await capability.execute({
      filePath: join(FIXTURES_DIR, "kitchen-sample.mp4"),
      atMs: 200,
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });

    const furniture = result.output.objects.filter((o) =>
      ["refrigerator", "chair", "dining table", "oven", "sink"].includes(o.cocoClass),
    );
    expect(furniture.length).toBeGreaterThan(0);
    for (const item of furniture) {
      expect(item.category).toBe("decorative");
    }
  }, 20_000);

  it("bounding boxes ficam dentro dos limites do frame", async () => {
    const capability = new ObjectDetectCapability(MODEL_PATH);
    const result = await capability.execute({
      filePath: join(FIXTURES_DIR, "kitchen-sample.mp4"),
      atMs: 200,
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });

    for (const object of result.output.objects) {
      expect(object.boundingBox.x).toBeGreaterThanOrEqual(-5);
      expect(object.boundingBox.y).toBeGreaterThanOrEqual(-5);
      expect(object.boundingBox.x + object.boundingBox.width).toBeLessThanOrEqual(FRAME_WIDTH + 5);
      expect(object.boundingBox.y + object.boundingBox.height).toBeLessThanOrEqual(FRAME_HEIGHT + 5);
    }
  }, 20_000);
});
