import { describe, expect, it } from "vitest";
import { computeSafeCropAfterRotation } from "../rotatedRectCrop.js";

describe("computeSafeCropAfterRotation", () => {
  it("sem rotação, retorna as dimensões originais", () => {
    const crop = computeSafeCropAfterRotation(1280, 720, 0);
    expect(crop).toEqual({ width: 1280, height: 720 });
  });

  it("quadrado rotacionado 45° -> maior quadrado inscrito é lado/√2 (resultado geométrico conhecido)", () => {
    const crop = computeSafeCropAfterRotation(1000, 1000, Math.PI / 4);
    const expected = 1000 / Math.sqrt(2);
    expect(crop.width).toBeCloseTo(expected, 3);
    expect(crop.height).toBeCloseTo(expected, 3);
  });

  it("quanto maior o ângulo, menor o recorte seguro", () => {
    const small = computeSafeCropAfterRotation(1280, 720, (2 * Math.PI) / 180);
    const large = computeSafeCropAfterRotation(1280, 720, (8 * Math.PI) / 180);
    expect(large.width).toBeLessThan(small.width);
    expect(large.height).toBeLessThan(small.height);
  });

  it("nunca retorna dimensões maiores que as originais", () => {
    for (const deg of [1, 3, 5, 8, 10, 20]) {
      const crop = computeSafeCropAfterRotation(1920, 1080, (deg * Math.PI) / 180);
      expect(crop.width).toBeLessThanOrEqual(1920);
      expect(crop.height).toBeLessThanOrEqual(1080);
      expect(crop.width).toBeGreaterThan(0);
      expect(crop.height).toBeGreaterThan(0);
    }
  });
});
