/**
 * Converte um buffer BGR24 (HWC, uint8) em tensor CHW float32 SEM normalização
 * — o YOLOX espera pixels crus em [0,255], só transpostos
 * (yolox/data/data_augment.py::preproc, verificado em Python antes de portar).
 */
export function bgr24ToYoloxTensor(bgr24: Buffer, size: number): Float32Array {
  const pixelCount = size * size;
  const tensor = new Float32Array(3 * pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 3;
    for (let channel = 0; channel < 3; channel++) {
      tensor[channel * pixelCount + pixel] = bgr24[offset + channel] as number;
    }
  }

  return tensor;
}
