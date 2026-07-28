import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

/**
 * Fonte única dos binários FFmpeg/FFprobe reais (via ffmpeg-static/ffprobe-static).
 * Nenhuma outra parte do código deve resolver esses caminhos por conta própria.
 */
export const FFMPEG_PATH: string = ffmpegPath as unknown as string;
export const FFPROBE_PATH: string = ffprobeStatic.path;
