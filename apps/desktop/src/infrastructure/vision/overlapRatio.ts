import type { Box } from "./unionBoxWithMargin.js";

/**
 * Fração da MENOR das duas caixas que está dentro da interseção.
 *
 * Deliberadamente não é IoU: aqui a pergunta é "estas duas caixas falam do
 * mesmo objeto?", e uma caixa pequena inteiramente contida numa grande é
 * exatamente isso — mas teria IoU baixo justamente por causa da diferença de
 * tamanho.
 */
export function overlapRatio(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}
