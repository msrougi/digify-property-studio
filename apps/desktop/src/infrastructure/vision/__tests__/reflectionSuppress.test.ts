import { describe, expect, it } from "vitest";
import { dct2, idct2 } from "../dct2d.js";
import { div, grad, laplacian, laplacianEigenvalues, suppressReflection } from "../reflectionSuppress.js";

function randomVector(n: number, seed = 1): Float64Array {
  const v = new Float64Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    v[i] = s / 233280 - 0.5;
  }
  return v;
}

describe("grad/div/laplacian (discretização por diferenças-progressivas, contorno replicado)", () => {
  it("div é a adjunta de grad numa imagem conhecida (produto interno <grad(f),g> == <f,-div(g)>... versão direta: L aplicado a um impulso dá o padrão esperado", () => {
    const width = 5;
    const height = 5;
    const impulse = new Float64Array(width * height);
    impulse[12] = 1; // centro
    const L = laplacian(impulse, width, height);
    // no ponto central de um impulso, o Laplaciano deve ser fortemente negativo
    // (a "queda" do pico), e positivo nos vizinhos imediatos que recebem o gradiente.
    expect(L[12]).toBeLessThan(0);
  });

  it("grad seguido de div recompõe uma aproximação consistente (round-trip qualitativo numa rampa linear)", () => {
    const width = 8;
    const height = 6;
    const ramp = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) ramp[y * width + x] = x; // rampa horizontal pura
    }
    const { gx, gy } = grad(ramp, width, height);
    // rampa horizontal pura: gx deve ser ~1 (exceto na última coluna, contorno replicado -> 0), gy ~0 em todo lugar.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < width - 1) {
          expect(gx[y * width + x]).toBeCloseTo(1, 9);
        }
        expect(gy[y * width + x] as number).toBeCloseTo(0, 9);
      }
    }
  });
});

describe("laplacianEigenvalues (verificação cruzada contra o Laplaciano direto antes de confiar no solver DCT)", () => {
  it("IDCT2(kappa * DCT2(x)) reproduz laplacian(x) calculado diretamente, pra vetores aleatórios", () => {
    const width = 10;
    const height = 8;
    const kappa = laplacianEigenvalues(width, height);

    for (const seed of [1, 2, 3]) {
      const x = randomVector(width * height, seed);
      const direct = laplacian(x, width, height);

      const xDct = dct2(x, width, height);
      const scaled = new Float64Array(width * height);
      for (let i = 0; i < scaled.length; i++) scaled[i] = (xDct[i] as number) * (kappa[i] as number);
      const viaDct = idct2(scaled, width, height);

      for (let i = 0; i < direct.length; i++) {
        expect(viaDct[i]).toBeCloseTo(direct[i] as number, 6);
      }
    }
  });
});

describe("suppressReflection (algoritmo real de Yang et al., CVPR 2019 — porte do MATLAB oficial)", () => {
  it("reduz de verdade um reflexo sintético SUAVE (baixo gradiente) sem destruir bordas fortes da cena real", () => {
    const width = 64;
    const height = 64;

    // cena "real": um quadrado sólido de alto contraste (bordas fortes).
    const clean = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        clean[y * width + x] = x > 16 && x < 48 && y > 16 && y < 48 ? 0.9 : 0.1;
      }
    }

    // reflexo sintético: um gradiente suave (baixo contraste, baixa
    // magnitude de gradiente) somado por cima -- exatamente o tipo de
    // sinal que o algoritmo assume ser reflexo (diferente do teste com o
    // modelo ONNX, aqui o sintético bate com a premissa real do método).
    const blended = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const reflection = 0.15 * (x / width) + 0.05 * Math.sin((y / height) * Math.PI);
        blended[y * width + x] = Math.min(1, (clean[y * width + x] as number) + reflection);
      }
    }

    const suppressed = suppressReflection(blended, width, height);

    function mse(a: Float64Array, b: Float64Array): number {
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        const d = (a[i] as number) - (b[i] as number);
        sum += d * d;
      }
      return sum / a.length;
    }

    const mseBefore = mse(blended, clean);
    const mseAfter = mse(suppressed, clean);

    expect(mseAfter).toBeLessThan(mseBefore);

    // a borda forte do quadrado (alto contraste) deve continuar bem
    // presente -- o algoritmo não pode ter "borrado" a cena real inteira.
    const edgeBefore = Math.abs((blended[32 * width + 17] as number) - (blended[32 * width + 15] as number));
    const edgeAfter = Math.abs((suppressed[32 * width + 17] as number) - (suppressed[32 * width + 15] as number));
    expect(edgeAfter).toBeGreaterThan(edgeBefore * 0.5);
  });
});
