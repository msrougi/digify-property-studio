import { describe, expect, it } from "vitest";
import { detectClutterRegions } from "../detectClutterRegions.js";

const WIDTH = 240;
const HEIGHT = 180;

function makeUniformBuffer(width: number, height: number, value: number): Buffer {
  return Buffer.alloc(width * height, value);
}

/**
 * Fundo "liso" de verdade tem sempre um mínimo de ruído de sensor — um
 * buffer 100% idêntico pixel a pixel (`makeUniformBuffer` puro) é uma
 * situação sintética que nenhuma foto real produz, e faz qualquer variação
 * mínima parecer estatisticamente enorme (desvio-padrão do fundo fica ~0).
 * PRNG determinístico (sem flakiness) simulando esse piso de ruído real.
 */
function addNoiseFloor(buffer: Buffer, width: number, height: number, amplitude: number, seed = 42): void {
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < width * height; i++) {
    const noise = Math.round((next() - 0.5) * 2 * amplitude);
    buffer[i] = Math.max(0, Math.min(255, (buffer[i] as number) + noise));
  }
}

/** Preenche um retângulo com um padrão de xadrez de alto contraste — textura real, não ruído aleatório (determinístico, sem flakiness). */
function paintCheckerboardPatch(
  buffer: Buffer,
  width: number,
  x: number,
  y: number,
  patchWidth: number,
  patchHeight: number,
): void {
  for (let py = y; py < y + patchHeight; py++) {
    for (let px = x; px < x + patchWidth; px++) {
      const isDark = (Math.floor(px / 4) + Math.floor(py / 4)) % 2 === 0;
      buffer[py * width + px] = isDark ? 20 : 235;
    }
  }
}

describe("detectClutterRegions", () => {
  it("não encontra nada numa imagem completamente uniforme (sem variação nenhuma pra destoar)", () => {
    const buffer = makeUniformBuffer(WIDTH, HEIGHT, 128);
    expect(detectClutterRegions(buffer, WIDTH, HEIGHT)).toHaveLength(0);
  });

  it("detecta uma região real de bagunça (textura alta) num frame majoritariamente liso", () => {
    const buffer = makeUniformBuffer(WIDTH, HEIGHT, 128);
    addNoiseFloor(buffer, WIDTH, HEIGHT, 4);
    paintCheckerboardPatch(buffer, WIDTH, 100, 60, 60, 50);

    const regions = detectClutterRegions(buffer, WIDTH, HEIGHT);

    expect(regions.length).toBeGreaterThan(0);
    // A região detectada precisa cobrir de verdade a área do xadrez, não
    // estar em outro lugar do frame.
    const covers = regions.some(
      (region) =>
        region.x <= 130 &&
        region.x + region.width >= 130 &&
        region.y <= 85 &&
        region.y + region.height >= 85,
    );
    expect(covers).toBe(true);
  });

  it("nunca marca uma região excluída (ex.: pessoa detectada) mesmo sendo bem texturizada", () => {
    const buffer = makeUniformBuffer(WIDTH, HEIGHT, 128);
    addNoiseFloor(buffer, WIDTH, HEIGHT, 4);
    paintCheckerboardPatch(buffer, WIDTH, 100, 60, 60, 50);

    const regions = detectClutterRegions(buffer, WIDTH, HEIGHT, [
      { x: 90, y: 50, width: 80, height: 70 },
    ]);

    expect(regions).toHaveLength(0);
  });

  it("ignora um padrão de textura que cobre o frame inteiro (piso/parede texturizado de verdade, não bagunça removível)", () => {
    const buffer = makeUniformBuffer(WIDTH, HEIGHT, 128);
    paintCheckerboardPatch(buffer, WIDTH, 0, 0, WIDTH, HEIGHT);

    const regions = detectClutterRegions(buffer, WIDTH, HEIGHT);

    // Textura uniforme no frame inteiro não "destoa" de nada — cada célula
    // tem score parecido, então nada fica significativamente acima da
    // média + desvio-padrão.
    expect(regions).toHaveLength(0);
  });

  it.each([1, 2, 3, 4, 5, 42, 999, 123456])(
    "uma câmera mais granulada (ruído uniforme em todo o frame, seed=%i) não gera falso positivo — nada destoa do resto se tudo tem o mesmo ruído",
    (seed) => {
      const buffer = makeUniformBuffer(WIDTH, HEIGHT, 128);
      addNoiseFloor(buffer, WIDTH, HEIGHT, 15, seed);

      const regions = detectClutterRegions(buffer, WIDTH, HEIGHT);
      expect(regions).toHaveLength(0);
    },
  );
});
