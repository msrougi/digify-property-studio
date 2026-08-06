/**
 * Redimensionamento bilinear de um buffer RGB (3 bytes por pixel).
 *
 * Necessário porque o LaMa roda numa resolução fixa e pequena (custo de
 * inferência cresce rápido: 128px ~357ms/frame, 256px ~979ms — medido), mas
 * o vídeo do usuário é 1080p ou mais. O fluxo é: recortar a região com
 * bagunça → encolher pro tamanho do modelo → inferir → ampliar de volta →
 * compor só nos pixels mascarados.
 *
 * Bilinear (e não vizinho-mais-próximo) porque o resultado é composto de
 * volta sobre a imagem real: interpolação dura deixa serrilhado visível na
 * borda do remendo.
 */
export function resizeRgb(
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Buffer {
  const output = Buffer.alloc(targetWidth * targetHeight * 3);
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return output;

  // Mapeia pelo CENTRO do pixel: sem o -0.5 a imagem escorrega meio pixel a
  // cada redimensionamento, e aqui sempre há dois (ida e volta) — o erro
  // dobraria e o remendo ficaria deslocado em relação ao que ele cobre.
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const weightY = sourceY - y0;

    for (let x = 0; x < targetWidth; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const weightX = sourceX - x0;

      const topLeft = (y0 * sourceWidth + x0) * 3;
      const topRight = (y0 * sourceWidth + x1) * 3;
      const bottomLeft = (y1 * sourceWidth + x0) * 3;
      const bottomRight = (y1 * sourceWidth + x1) * 3;
      const target = (y * targetWidth + x) * 3;

      for (let channel = 0; channel < 3; channel++) {
        const top =
          (source[topLeft + channel] as number) * (1 - weightX) +
          (source[topRight + channel] as number) * weightX;
        const bottom =
          (source[bottomLeft + channel] as number) * (1 - weightX) +
          (source[bottomRight + channel] as number) * weightX;
        output[target + channel] = Math.round(top * (1 - weightY) + bottom * weightY);
      }
    }
  }

  return output;
}
