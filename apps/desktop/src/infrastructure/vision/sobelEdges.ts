export interface EdgePoint {
  x: number;
  y: number;
  magnitude: number;
}

/**
 * Detecção de bordas real via operador de Sobel (3x3, kernels padrão Gx/Gy) —
 * matemática clássica de processamento de imagem, não um modelo de IA. Entrada
 * é um buffer de 1 byte/pixel (escala de cinza). Retorna só os pixels cuja
 * magnitude de gradiente passa `threshold`, já filtrados para manter o Hough
 * Transform seguinte (`houghHorizonDetect.ts`) barato.
 */
export function detectSobelEdges(
  buffer: Buffer,
  width: number,
  height: number,
  threshold = 80,
): EdgePoint[] {
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  const edges: EdgePoint[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sumX = 0;
      let sumY = 0;
      let kernelIndex = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = buffer[(y + ky) * width + (x + kx)] as number;
          sumX += pixel * (gx[kernelIndex] as number);
          sumY += pixel * (gy[kernelIndex] as number);
          kernelIndex++;
        }
      }

      const magnitude = Math.sqrt(sumX * sumX + sumY * sumY);
      if (magnitude >= threshold) {
        edges.push({ x, y, magnitude });
      }
    }
  }

  return edges;
}
