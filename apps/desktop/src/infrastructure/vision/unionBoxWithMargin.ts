export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * União das caixas + margem de contexto, recortada aos limites do frame.
 * O inpainting real (LaMa) precisa de pixels de contexto ao redor da região
 * removida para gerar um preenchimento plausível — uma caixa justa ao objeto
 * famintaria o modelo de contexto.
 */
export function computeUnionBoxWithMargin(
  boxes: Box[],
  marginPx: number,
  frameWidth: number,
  frameHeight: number,
): Box {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));

  const x = Math.max(0, Math.floor(minX - marginPx));
  const y = Math.max(0, Math.floor(minY - marginPx));
  const right = Math.min(frameWidth, Math.ceil(maxX + marginPx));
  const bottom = Math.min(frameHeight, Math.ceil(maxY + marginPx));

  return { x, y, width: Math.max(2, right - x), height: Math.max(2, bottom - y) };
}
