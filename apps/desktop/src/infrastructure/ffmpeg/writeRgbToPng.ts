import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./paths.js";

/** Codifica um buffer RGB24 cru (HWC) num arquivo PNG real via FFmpeg. */
export function writeRgbToPng(
  buffer: Buffer,
  width: number,
  height: number,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${width}x${height}`,
      "-i",
      "-",
      "-frames:v",
      "1",
      "-update",
      "1",
      outputPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg falhou ao escrever PNG (código ${code}): ${stderr}`));
        return;
      }
      resolve();
    });

    ffmpeg.stdin.write(buffer);
    ffmpeg.stdin.end();
  });
}
