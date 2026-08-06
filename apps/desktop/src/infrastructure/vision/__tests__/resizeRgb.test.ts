import { describe, expect, it } from "vitest";
import { resizeRgb } from "../resizeRgb.js";

function solid(width: number, height: number, r: number, g: number, b: number): Buffer {
  const buffer = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    buffer[i * 3] = r;
    buffer[i * 3 + 1] = g;
    buffer[i * 3 + 2] = b;
  }
  return buffer;
}

describe("resizeRgb", () => {
  it("preserva uma cor sólida em qualquer tamanho (nenhuma interpolação inventa cor)", () => {
    const source = solid(8, 8, 10, 200, 30);
    for (const [w, h] of [
      [4, 4],
      [16, 16],
      [3, 11],
    ]) {
      const out = resizeRgb(source, 8, 8, w as number, h as number);
      expect(out.length).toBe((w as number) * (h as number) * 3);
      for (let i = 0; i < (w as number) * (h as number); i++) {
        expect([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]).toEqual([10, 200, 30]);
      }
    }
  });

  it("ida e volta mantém a imagem alinhada — sem escorregar meio pixel", () => {
    // Metade esquerda preta, metade direita branca: se o mapeamento
    // escorregasse, a divisa mudaria de coluna no retorno.
    const width = 64;
    const height = 8;
    const source = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = x < width / 2 ? 0 : 255;
        const i = (y * width + x) * 3;
        source[i] = value;
        source[i + 1] = value;
        source[i + 2] = value;
      }
    }

    const shrunk = resizeRgb(source, width, height, 16, 4);
    const back = resizeRgb(shrunk, 16, 4, width, height);

    // Longe da divisa, os valores têm que continuar nos extremos.
    const meio = Math.floor(height / 2);
    const esquerda = (meio * width + 4) * 3;
    const direita = (meio * width + width - 5) * 3;
    expect(back[esquerda]).toBeLessThan(30);
    expect(back[direita]).toBeGreaterThan(225);
  });

  it("interpola de verdade ao ampliar (não duplica pixel bruto)", () => {
    // 2x1: preto e branco. Ampliando pra 4x1, os pixels do meio precisam
    // ficar em tons intermediários.
    const source = Buffer.from([0, 0, 0, 255, 255, 255]);
    const out = resizeRgb(source, 2, 1, 4, 1);
    const valores = [out[0], out[3], out[6], out[9]] as number[];
    expect(valores[0]).toBe(0);
    expect(valores[3]).toBe(255);
    expect(valores[1]).toBeGreaterThan(0);
    expect(valores[2]).toBeLessThan(255);
    expect(valores[2] as number).toBeGreaterThan(valores[1] as number);
  });
});
