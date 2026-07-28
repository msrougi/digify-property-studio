import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFPROBE_PATH } from "./paths.js";

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codecName: string;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type: "video" | "audio" | "subtitle" | "data";
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format: { duration?: string };
}

function parseFrameRate(rFrameRate: string): number {
  const [numerator, denominator] = rFrameRate.split("/").map(Number);
  if (!numerator || !denominator) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

/**
 * Extrai metadados reais do vídeo via FFprobe — substitui o placeholder anterior
 * (docs/CAPABILITY_REGISTRY.md, capability `intake`).
 */
export async function readVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const probe = JSON.parse(stdout) as FfprobeOutput;
  const videoStream = probe.streams.find((stream) => stream.codec_type === "video");

  if (!videoStream) {
    throw new Error(`Nenhuma faixa de vídeo encontrada em ${filePath}`);
  }

  const durationSeconds = Number(probe.format.duration ?? 0);
  const hasAudio = probe.streams.some((stream) => stream.codec_type === "audio");

  return {
    durationMs: Math.round(durationSeconds * 1000),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps: videoStream.r_frame_rate ? parseFrameRate(videoStream.r_frame_rate) : 0,
    codecName: videoStream.codec_name ?? "unknown",
    hasAudio,
  };
}
