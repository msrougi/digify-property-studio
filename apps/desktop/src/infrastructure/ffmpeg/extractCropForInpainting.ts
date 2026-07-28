import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

export interface InpaintingCrop {
  /** RGB24 (HWC), já com padding — pronto para o LaMa (`pad_mod=8`). */
  buffer: Buffer;
  /** Tamanho real do recorte, antes do padding (o que deve aparecer no vídeo final). */
  width: number;
  height: number;
  /** Tamanho com padding — o que de fato entra no modelo. */
  paddedWidth: number;
  paddedHeight: number;
}

/**
 * Recorta uma região real do vídeo (não o frame inteiro) no timestamp pedido
 * e faz o padding até múltiplo de 8 exigido pelo LaMa (`pad_img_to_modulo`,
 * mesma convenção do IOPaint — preenche só embaixo/direita, sem centralizar).
 */
export function extractCropForInpainting(
  filePath: string,
  atMs: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<InpaintingCrop> {
  const paddedWidth = Math.ceil(width / 8) * 8;
  const paddedHeight = Math.ceil(height / 8) * 8;

  return new Promise((resolve, reject) => {
    const seconds = (atMs / 1000).toFixed(3);
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-ss",
      seconds,
      "-i",
      filePath,
      "-vf",
      `crop=${width}:${height}:${x}:${y},pad=${paddedWidth}:${paddedHeight}:0:0`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ]);

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.on("error", reject);

    ffmpeg.on("close", () => {
      const buffer = Buffer.concat(chunks);
      const expectedBytes = paddedWidth * paddedHeight * 3;
      if (buffer.length !== expectedBytes) {
        reject(
          new Error(
            `Recorte extraído com tamanho inesperado: ${buffer.length} bytes (esperado ${expectedBytes})`,
          ),
        );
        return;
      }
      resolve({ buffer, width, height, paddedWidth, paddedHeight });
    });
  });
}
