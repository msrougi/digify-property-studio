import { describe, expect, it } from "vitest";
import { DetectedObject } from "../entities/DetectedObject.js";

describe("DetectedObject", () => {
  it("objetos estruturais nunca são removíveis (realidade do imóvel é inviolável)", () => {
    const wall = DetectedObject.create({
      id: "o1",
      sceneId: "s1",
      category: "structural",
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      confidence: 99,
    });

    expect(wall.toProps().removable).toBe(false);
  });

  it("objetos temporários são removíveis", () => {
    const clothes = DetectedObject.create({
      id: "o2",
      sceneId: "s1",
      category: "temporary",
      boundingBox: { x: 10, y: 10, width: 20, height: 20 },
      confidence: 88,
    });

    expect(clothes.toProps().removable).toBe(true);
  });
});
