import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "../infrastructure/ffmpeg/paths.js";

/**
 * Gera um vídeo sintético real: um quadrado de alto contraste (a "cena
 * real", bordas fortes) com um reflexo sintético SUAVE (gradiente de baixo
 * contraste) somado por cima — mesmo padrão usado em
 * `reflectionSuppress.test.ts`, agora como vídeo MP4 de verdade (não só um
 * buffer em memória) pra verificar o pipeline completo (capabilities +
 * Rendering Engine + FFmpeg de verdade) em loop fechado.
 *
 * `withReflection=false` gera a versão "limpa" (sem o termo de reflexo) —
 * usada como ground truth pra medir se a correção de fato aproxima o
 * resultado renderizado da cena real.
 */
export function generateSyntheticReflectionTestVideo(
  outputPath: string,
  withReflection: boolean,
  options: { width?: number; height?: number; durationSec?: number } = {},
): Promise<void> {
  const width = options.width ?? 320;
  const height = options.height ?? 240;
  const durationSec = options.durationSec ?? 1;

  const buffer = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inSquare = x > width * 0.25 && x < width * 0.75 && y > height * 0.25 && y < height * 0.75;
      let value = inSquare ? 0.9 : 0.1;
      if (withReflection) {
        value += 0.15 * (x / width) + 0.05 * Math.sin((y / height) * Math.PI);
      }
      const byte = Math.round(Math.min(1, Math.max(0, value)) * 255);
      const idx = (y * width + x) * 3;
      buffer[idx] = byte;
      buffer[idx + 1] = byte;
      buffer[idx + 2] = byte;
    }
  }

  const fps = 10;
  const frameCount = Math.max(1, Math.round(durationSec * fps));

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${width}x${height}`,
      "-r",
      String(fps),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg falhou ao gerar vídeo sintético de reflexo (código ${code}): ${stderr}`));
        return;
      }
      resolve();
    });

    for (let i = 0; i < frameCount; i++) {
      ffmpeg.stdin.write(buffer);
    }
    ffmpeg.stdin.end();
  });
}
