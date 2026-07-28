export interface SafeCrop {
  width: number;
  height: number;
}

/**
 * Maior retângulo com a mesma proporção W:H que cabe inteiramente dentro da
 * imagem original depois de rotacionada por `angleRadians` ao redor do centro
 * — evita os cantos pretos que o filtro `rotate` do FFmpeg deixa, sem
 * precisar expandir o canvas. Fórmula clássica do "maior retângulo inscrito
 * após rotação" (mesma família usada por ferramentas de "auto-crop depois de
 * endireitar horizonte").
 */
export function computeSafeCropAfterRotation(
  width: number,
  height: number,
  angleRadians: number,
): SafeCrop {
  const angle = Math.abs(angleRadians);
  if (angle < 1e-6) return { width, height };

  const wide = width >= height;
  const longSide = wide ? width : height;
  const shortSide = wide ? height : width;

  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);

  if (shortSide <= 2 * sinA * cosA * longSide || Math.abs(sinA - cosA) < 1e-10) {
    const x = 0.5 * shortSide;
    return wide ? { width: x / sinA, height: x / cosA } : { width: x / cosA, height: x / sinA };
  }

  const cos2A = cosA * cosA - sinA * sinA;
  return {
    width: (width * cosA - height * sinA) / cos2A,
    height: (height * cosA - width * sinA) / cos2A,
  };
}
