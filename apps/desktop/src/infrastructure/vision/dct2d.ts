/**
 * Transformada Discreta do Cosseno tipo II (DCT-II) ortonormal, 1D e 2D
 * (separável: aplica a 1D em cada linha, depois em cada coluna), e sua
 * inversa (DCT-III ortonormal, a transposta da matriz DCT-II).
 *
 * Usada por `reflectionSuppress.ts` pra resolver a equação diferencial da
 * supressão de reflexo no domínio da frequência (mesma técnica do código
 * MATLAB oficial de Yang et al., "Fast Single Image Reflection Suppression
 * via Convex Optimization", CVPR 2019 — `PoissonDCT_variant`).
 *
 * Implementação por multiplicação de matriz com a base de cossenos
 * pré-computada e cacheada por tamanho (não FFT) — mais simples de
 * verificar corretamente (ver `__tests__/dct2d.test.ts`: round-trip exato e
 * preservação de energia/Parseval) e rápida o bastante pro tamanho de
 * imagem usado aqui: recalcular `Math.cos` por elemento a cada linha/coluna
 * processada (o que uma implementação ingênua faria) é o gargalo real — a
 * base só depende de N, não do sinal de entrada, então só precisa ser
 * calculada uma vez por tamanho.
 */

/** Matriz `N x N` com `basis[k*N+n] = weight(k) * cos(pi*(2n+1)*k / (2N))` — as linhas são a base ortonormal da DCT-II. */
function buildBasis(n: number): Float64Array {
  const basis = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const weight = k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n);
    for (let x = 0; x < n; x++) {
      basis[k * n + x] = weight * Math.cos((Math.PI * (2 * x + 1) * k) / (2 * n));
    }
  }
  return basis;
}

const basisCache = new Map<number, Float64Array>();
function getBasis(n: number): Float64Array {
  let basis = basisCache.get(n);
  if (!basis) {
    basis = buildBasis(n);
    basisCache.set(n, basis);
  }
  return basis;
}

/**
 * DCT-II ortonormal 1D. `inverse=true` calcula a DCT-III ortonormal
 * (inversa exata da DCT-II — a matriz `basis` é ortonormal, então a
 * inversa é só a transposta).
 */
export function dct1d(input: Float64Array, inverse = false): Float64Array {
  const n = input.length;
  const basis = getBasis(n);
  const output = new Float64Array(n);

  if (!inverse) {
    // output[k] = sum_x basis[k][x] * input[x]
    for (let k = 0; k < n; k++) {
      let sum = 0;
      const rowOffset = k * n;
      for (let x = 0; x < n; x++) sum += (basis[rowOffset + x] as number) * (input[x] as number);
      output[k] = sum;
    }
  } else {
    // output[x] = sum_k basis[k][x] * input[k]  (transposta da matriz ortonormal)
    for (let k = 0; k < n; k++) {
      const inputK = input[k] as number;
      if (inputK === 0) continue;
      const rowOffset = k * n;
      for (let x = 0; x < n; x++) output[x] = (output[x] as number) + (basis[rowOffset + x] as number) * inputK;
    }
  }

  return output;
}

/** Aplica `dct1d` a cada linha e depois a cada coluna de uma matriz `height x width` (row-major, Float64Array). */
export function dct2(matrix: Float64Array, width: number, height: number, inverse = false): Float64Array {
  const afterRows = new Float64Array(width * height);
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = matrix[y * width + x] as number;
    const transformed = dct1d(row, inverse);
    for (let x = 0; x < width; x++) afterRows[y * width + x] = transformed[x] as number;
  }

  const result = new Float64Array(width * height);
  const col = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) col[y] = afterRows[y * width + x] as number;
    const transformed = dct1d(col, inverse);
    for (let y = 0; y < height; y++) result[y * width + x] = transformed[y] as number;
  }

  return result;
}

export function idct2(matrix: Float64Array, width: number, height: number): Float64Array {
  return dct2(matrix, width, height, true);
}
