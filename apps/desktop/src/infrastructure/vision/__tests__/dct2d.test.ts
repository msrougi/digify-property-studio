import { describe, expect, it } from "vitest";
import { dct1d, dct2, idct2 } from "../dct2d.js";

function randomVector(n: number, seed = 1): Float64Array {
  const v = new Float64Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    v[i] = s / 233280 - 0.5;
  }
  return v;
}

describe("dct1d", () => {
  it("é ortonormal: DCT-III(DCT-II(x)) recupera x exatamente (dentro de ponto flutuante)", () => {
    const x = randomVector(16);
    const roundTrip = dct1d(dct1d(x), true);
    for (let i = 0; i < x.length; i++) {
      expect(roundTrip[i]).toBeCloseTo(x[i] as number, 10);
    }
  });

  it("preserva energia (Parseval): soma dos quadrados é igual antes e depois da transformada", () => {
    const x = randomVector(32, 7);
    const X = dct1d(x);
    const energyBefore = Array.from(x).reduce((sum, v) => sum + v * v, 0);
    const energyAfter = Array.from(X).reduce((sum, v) => sum + v * v, 0);
    expect(energyAfter).toBeCloseTo(energyBefore, 8);
  });
});

describe("dct2/idct2", () => {
  it("round-trip 2D exato numa matriz não quadrada", () => {
    const width = 12;
    const height = 8;
    const matrix = randomVector(width * height, 3);
    const roundTrip = idct2(dct2(matrix, width, height), width, height);
    for (let i = 0; i < matrix.length; i++) {
      expect(roundTrip[i]).toBeCloseTo(matrix[i] as number, 9);
    }
  });
});
