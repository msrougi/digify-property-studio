const FRAME_SIZE = 224;

// Mesma normalização usada no treino (tools/room-classifier/scripts/extract_features.py)
// — precisa bater exatamente ou as predições ficam incorretas.
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * Converte um buffer RGB24 (HWC, uint8) em tensor normalizado CHW float32,
 * no formato esperado pelo MobileNetV2 (docs/adr — mesmo pipeline do treino).
 */
export function rgb24ToImagenetTensor(rgb24: Buffer): Float32Array {
  const pixelCount = FRAME_SIZE * FRAME_SIZE;
  const tensor = new Float32Array(3 * pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 3;
    for (let channel = 0; channel < 3; channel++) {
      const value = (rgb24[offset + channel] as number) / 255;
      const normalized = (value - (IMAGENET_MEAN[channel] as number)) / (IMAGENET_STD[channel] as number);
      // HWC -> CHW: canal vira o eixo mais externo.
      tensor[channel * pixelCount + pixel] = normalized;
    }
  }

  return tensor;
}
