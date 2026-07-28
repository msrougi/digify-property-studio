import { describe, expect, it } from "vitest";
import {
  rgb24ToLamaImageTensor,
  lamaImageTensorToRgb24,
  buildLamaMaskTensor,
} from "../lamaTensors.js";

describe("rgb24ToLamaImageTensor / lamaImageTensorToRgb24", () => {
  it("faz ida e volta preservando os valores de pixel (dentro do arredondamento)", () => {
    const width = 4;
    const height = 3;
    const original = Buffer.from(
      Array.from({ length: width * height * 3 }, (_, i) => (i * 17) % 256),
    );

    const tensor = rgb24ToLamaImageTensor(original, width, height);
    expect(tensor.length).toBe(3 * width * height);
    expect(tensor[0]).toBeCloseTo((original[0] as number) / 255, 5);

    const roundTripped = lamaImageTensorToRgb24(tensor, width, height);
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs((roundTripped[i] as number) - (original[i] as number))).toBeLessThanOrEqual(1);
    }
  });

  it("organiza o tensor em CHW (planos separados de R, G, B)", () => {
    const width = 2;
    const height = 1;
    // pixel 0 = vermelho puro, pixel 1 = azul puro
    const buffer = Buffer.from([255, 0, 0, 0, 0, 255]);
    const tensor = rgb24ToLamaImageTensor(buffer, width, height);

    const planeSize = width * height;
    expect(tensor[0]).toBeCloseTo(1, 5); // R do pixel 0
    expect(tensor[1]).toBeCloseTo(0, 5); // R do pixel 1
    expect(tensor[planeSize]).toBeCloseTo(0, 5); // G do pixel 0
    expect(tensor[2 * planeSize + 1]).toBeCloseTo(1, 5); // B do pixel 1
  });

  it("faz clamp de valores fora do range [0,255] na volta", () => {
    const tensor = new Float32Array([2, -1, 0.5, 0, 0, 0]);
    const rgb = lamaImageTensorToRgb24(tensor, 1, 2);
    expect(rgb[0]).toBe(255);
    expect(rgb[3]).toBe(0);
  });
});

describe("buildLamaMaskTensor", () => {
  it("marca só a região das caixas com 1, resto com 0", () => {
    const mask = buildLamaMaskTensor([{ x: 2, y: 1, width: 2, height: 1 }], 5, 3);
    expect(mask.length).toBe(15);

    // linha 1, colunas 2-3 devem ser 1
    expect(mask[1 * 5 + 2]).toBe(1);
    expect(mask[1 * 5 + 3]).toBe(1);
    // fora da caixa deve ser 0
    expect(mask[0]).toBe(0);
    expect(mask[1 * 5 + 4]).toBe(0);
    expect(mask[2 * 5 + 2]).toBe(0);
  });

  it("recorta a caixa nos limites do tensor sem estourar índice", () => {
    const mask = buildLamaMaskTensor([{ x: -2, y: -2, width: 4, height: 4 }], 3, 3);
    expect(mask[0]).toBe(1);
    expect(mask.length).toBe(9);
  });

  it("várias caixas se combinam (união) na mesma máscara", () => {
    const mask = buildLamaMaskTensor(
      [
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 4, y: 4, width: 1, height: 1 },
      ],
      5,
      5,
    );
    expect(mask[0]).toBe(1);
    expect(mask[4 * 5 + 4]).toBe(1);
    expect(mask[2 * 5 + 2]).toBe(0);
  });
});
