import { describe, expect, it } from "vitest";
import { detectSobelEdges } from "../sobelEdges.js";

function makeUniformBuffer(width: number, height: number, value: number): Buffer {
  return Buffer.alloc(width * height, value);
}

describe("detectSobelEdges", () => {
  it("não encontra bordas numa imagem completamente uniforme", () => {
    const buffer = makeUniformBuffer(50, 50, 128);
    expect(detectSobelEdges(buffer, 50, 50)).toHaveLength(0);
  });

  it("encontra bordas reais numa imagem com uma borda vertical nítida (preto/branco)", () => {
    const width = 50;
    const height = 50;
    const buffer = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        buffer[y * width + x] = x < width / 2 ? 0 : 255;
      }
    }

    const edges = detectSobelEdges(buffer, width, height);
    expect(edges.length).toBeGreaterThan(0);
    // A borda real está na coluna 25 (transição preto->branco) — os pontos
    // detectados devem se concentrar ali, não espalhados aleatoriamente.
    for (const edge of edges) {
      expect(edge.x).toBeGreaterThanOrEqual(23);
      expect(edge.x).toBeLessThanOrEqual(27);
    }
  });
});
