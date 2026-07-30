import { dct2, idct2 } from "./dct2d.js";

export interface GradientField {
  gx: Float64Array;
  gy: Float64Array;
}

/**
 * Gradiente por diferenças-progressivas com contorno replicado (derivada
 * zero na última linha/coluna) — mesma discretização de `grad.m` no código
 * MATLAB oficial de Yang et al. (CVPR 2019), a que diagonaliza certinho sob
 * DCT-II/Neumann.
 */
export function grad(image: Float64Array, width: number, height: number): GradientField {
  const gx = new Float64Array(width * height);
  const gy = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const right = x < width - 1 ? (image[idx + 1] as number) : (image[idx] as number);
      const down = y < height - 1 ? (image[idx + width] as number) : (image[idx] as number);
      gx[idx] = right - (image[idx] as number);
      gy[idx] = down - (image[idx] as number);
    }
  }
  return { gx, gy };
}

/** Divergência de um campo vetorial (inversa/adjunta de `grad`, mesmo contorno). */
export function div(field: GradientField, width: number, height: number): Float64Array {
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const gxLeft = x > 0 ? (field.gx[idx - 1] as number) : 0;
      const gyUp = y > 0 ? (field.gy[idx - width] as number) : 0;
      out[idx] = ((field.gx[idx] as number) - gxLeft) + ((field.gy[idx] as number) - gyUp);
    }
  }
  return out;
}

/** Laplaciano discreto L = div(grad(.)), mesma discretização acima. */
export function laplacian(image: Float64Array, width: number, height: number): Float64Array {
  return div(grad(image, width, height), width, height);
}

/**
 * Autovalores de `laplacian` sob a base ortonormal DCT-II (contorno de
 * Neumann/replicado) — fórmula clássica usada em edição de imagem via
 * Poisson no domínio da frequência, a mesma do `PoissonDCT_variant.m`
 * oficial. Verificado por `__tests__/reflectionSuppress.test.ts` contra o
 * Laplaciano calculado diretamente (`laplacian()` acima) antes de confiar
 * nele pro solver rápido.
 */
export function laplacianEigenvalues(width: number, height: number): Float64Array {
  const kappa = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const ly = 2 * Math.cos((Math.PI * y) / height);
    for (let x = 0; x < width; x++) {
      const lx = 2 * Math.cos((Math.PI * x) / width);
      kappa[y * width + x] = lx + ly - 4;
    }
  }
  return kappa;
}

/**
 * Resolve (L² + epsilon·I)·u = rhs via DCT — `u = IDCT2( DCT2(rhs) / (kappa² + epsilon) )`,
 * onde `kappa` são os autovalores de `laplacian` sob DCT-II. Mesma técnica
 * de `PoissonDCT_variant.m` (mu=1, lambda=0 no código original — só usamos
 * esse caso, que é o único usado pelo algoritmo de supressão de reflexo).
 */
function solvePoissonDct(rhs: Float64Array, width: number, height: number): Float64Array {
  const kappa = laplacianEigenvalues(width, height);
  const rhsDct = dct2(rhs, width, height);
  const solutionDct = new Float64Array(width * height);
  for (let i = 0; i < solutionDct.length; i++) {
    const denom = (kappa[i] as number) * (kappa[i] as number) + EPSILON;
    solutionDct[i] = (rhsDct[i] as number) / denom;
  }
  return idct2(solutionDct, width, height);
}

/** Limiar de magnitude de gradiente — abaixo disso, o gradiente é considerado "reflexo" e zerado. */
const GRADIENT_THRESHOLD = 0.033;
/** Regularização — mesmo valor usado no paper/código de referência (`epsilon` em PoissonDCT_variant). */
const EPSILON = 1e-8;

/**
 * Núcleo real do algoritmo de Yang et al., "Fast Single Image Reflection
 * Suppression via Convex Optimization" (CVPR 2019) — porte do código MATLAB
 * oficial (`github.com/yyhz76/reflectSuppress`, lido linha a linha pra
 * garantir fidelidade). Não é um modelo de IA/pesos treinados — é um solver
 * de equação diferencial (fidelidade de dado laplaciana + esparsidade de
 * gradiente, resolvido via DCT), mesma categoria de `houghLineDetect.ts`
 * (geometria/matemática clássica determinística).
 *
 * Ideia central: gradientes de baixa magnitude tendem a vir de reflexos
 * fora de foco/difusos; gradientes fortes tendem a ser a cena real. O
 * algoritmo zera os gradientes fracos, recalcula um "laplaciano" só a
 * partir dos fortes, e resolve de volta pra uma imagem cujo gradiente
 * concorda com esse laplaciano esparso — na prática suprime o
 * "espalhamento" de baixo contraste do reflexo mantendo bordas fortes
 * intactas.
 *
 * Opera por canal de cor independentemente, em ponto flutuante [0,1].
 */
export function suppressReflection(
  channel: Float64Array,
  width: number,
  height: number,
): Float64Array {
  const { gx, gy } = grad(channel, width, height);

  const gxThresh = new Float64Array(width * height);
  const gyThresh = new Float64Array(width * height);
  for (let i = 0; i < gx.length; i++) {
    const gxVal = gx[i] as number;
    const gyVal = gy[i] as number;
    const norm = Math.sqrt(gxVal * gxVal + gyVal * gyVal);
    if (norm > GRADIENT_THRESHOLD) {
      gxThresh[i] = gxVal;
      gyThresh[i] = gyVal;
    }
  }

  const divThresh = div({ gx: gxThresh, gy: gyThresh }, width, height);
  const laplacianOfDiv = laplacian(divThresh, width, height);

  const rhs = new Float64Array(width * height);
  for (let i = 0; i < rhs.length; i++) {
    rhs[i] = (laplacianOfDiv[i] as number) + EPSILON * (channel[i] as number);
  }

  return solvePoissonDct(rhs, width, height);
}

export interface RgbSuppressionResult {
  /** Buffer RGB24 (HWC) já suprimido, pronto pra virar PNG. */
  buffer: Buffer;
  /** Diferença média absoluta por pixel/canal entre entrada e saída, em [0,1] — quanto o algoritmo de fato mudou a imagem (sinal usado por `ReflectionAnalyzeCapability`). */
  meanAbsoluteChange: number;
}

/** Aplica `suppressReflection` a cada canal de um buffer RGB24 (HWC) e reconstrói o RGB24 de saída. */
export function suppressReflectionRgb(rgb: Buffer, width: number, height: number): RgbSuppressionResult {
  const pixelCount = width * height;
  const channels: Float64Array[] = [
    new Float64Array(pixelCount),
    new Float64Array(pixelCount),
    new Float64Array(pixelCount),
  ];

  for (let i = 0; i < pixelCount; i++) {
    (channels[0] as Float64Array)[i] = (rgb[i * 3] as number) / 255;
    (channels[1] as Float64Array)[i] = (rgb[i * 3 + 1] as number) / 255;
    (channels[2] as Float64Array)[i] = (rgb[i * 3 + 2] as number) / 255;
  }

  const suppressed = channels.map((channel) => suppressReflection(channel, width, height));

  const out = Buffer.alloc(pixelCount * 3);
  let absDiffSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    for (let c = 0; c < 3; c++) {
      const before = (channels[c] as Float64Array)[i] as number;
      const after = (suppressed[c] as Float64Array)[i] as number;
      absDiffSum += Math.abs(after - before);
      const clamped = Math.max(0, Math.min(1, after));
      out[i * 3 + c] = Math.round(clamped * 255);
    }
  }

  return { buffer: out, meanAbsoluteChange: absDiffSum / (pixelCount * 3) };
}
