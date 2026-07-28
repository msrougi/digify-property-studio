/**
 * Conversões de tensor do LaMa — normalização real confirmada lendo o código
 * fonte do IOPaint (`norm_img`: HWC uint8 [0,255] -> CHW float32 [0,1], sem
 * mean/std do ImageNet, diferente do room_classifier) e verificada contra o
 * TorchScript original em `tools/inpainting/verify_onnx.py`.
 */

/** RGB24 (HWC, uint8) -> tensor CHW float32 normalizado [0,1], no formato NCHW (batch=1). */
export function rgb24ToLamaImageTensor(buffer: Buffer, width: number, height: number): Float32Array {
  const planeSize = width * height;
  const tensor = new Float32Array(3 * planeSize);

  for (let i = 0; i < planeSize; i++) {
    const offset = i * 3;
    tensor[i] = (buffer[offset] as number) / 255; // R
    tensor[planeSize + i] = (buffer[offset + 1] as number) / 255; // G
    tensor[2 * planeSize + i] = (buffer[offset + 2] as number) / 255; // B
  }

  return tensor;
}

/** Tensor CHW float32 [0,1] (NCHW batch=1) -> RGB24 (HWC, uint8), com clamp real. */
export function lamaImageTensorToRgb24(tensor: Float32Array, width: number, height: number): Buffer {
  const planeSize = width * height;
  const buffer = Buffer.alloc(planeSize * 3);

  for (let i = 0; i < planeSize; i++) {
    const r = clampByte((tensor[i] as number) * 255);
    const g = clampByte((tensor[planeSize + i] as number) * 255);
    const b = clampByte((tensor[2 * planeSize + i] as number) * 255);
    const offset = i * 3;
    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
  }

  return buffer;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export interface MaskBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Máscara binária (1 = remover/gerar, 0 = manter original) no formato NCHW
 * (1,1,H,W) esperado pelo LaMa — mesma convenção confirmada no grafo do
 * modelo (`masked_img = img*(1-mask)`).
 */
export function buildLamaMaskTensor(
  boxes: MaskBox[],
  width: number,
  height: number,
): Float32Array {
  const tensor = new Float32Array(width * height);

  for (const box of boxes) {
    const startX = Math.max(0, Math.round(box.x));
    const startY = Math.max(0, Math.round(box.y));
    const endX = Math.min(width, Math.round(box.x + box.width));
    const endY = Math.min(height, Math.round(box.y + box.height));

    for (let row = startY; row < endY; row++) {
      for (let col = startX; col < endX; col++) {
        tensor[row * width + col] = 1;
      }
    }
  }

  return tensor;
}
