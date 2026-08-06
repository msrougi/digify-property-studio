import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMovingClutteredTestVideo } from "../../../test-support/generateMovingClutteredTestVideo.js";
import { extractGrayscaleFrame } from "../../ffmpeg/extractGrayscaleFrame.js";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { FrameByFrameCleaner } from "../FrameByFrameCleaner.js";

const MODEL_PATH = join(process.cwd(), "models", "lama_inpainting.onnx");
// O modelo (~196MB) é remontado a partir de models/*.parts no build. Onde ele
// não estiver montado, o teste não tem o que verificar — pular é honesto,
// inventar um dublê de inferência não seria.
const describeWithModel = existsSync(MODEL_PATH) ? describe : describe.skip;

const WIDTH = 320;
const HEIGHT = 240;
const PATCH = { x: 40, y: 60, width: 90, height: 70, driftPxPerSec: 60 };

/** Variância da luma: mede quanto "ruído visual" (bagunça) sobrou na região. */
function variance(
  buffer: Buffer,
  width: number,
  box: { x: number; y: number; width: number; height: number },
): number {
  const values: number[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      values.push(buffer[y * width + x] as number);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

describeWithModel("FrameByFrameCleaner", () => {
  it(
    "limpa a bagunça mesmo com a câmera em movimento (o caso que o overlay estático não resolvia)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-fbf-"));
      const sourcePath = join(dir, "cluttered.mp4");
      const outputPath = join(dir, "clean.mp4");

      await generateMovingClutteredTestVideo(
        sourcePath,
        { width: WIDTH, height: HEIGHT },
        PATCH,
        1,
        10,
      );

      const progress: number[] = [];
      const cleaner = new FrameByFrameCleaner(MODEL_PATH);
      expect(cleaner.isAvailable()).toBe(true);
      await cleaner.clean(sourcePath, outputPath, (update) =>
        progress.push(update.framesProcessed),
      );

      const sourceMeta = await readVideoMetadata(sourcePath);
      const outputMeta = await readVideoMetadata(outputPath);
      expect(outputMeta.width).toBe(sourceMeta.width);
      expect(outputMeta.height).toBe(sourceMeta.height);
      expect(outputMeta.durationMs).toBeGreaterThanOrEqual(sourceMeta.durationMs - 200);

      // Todo quadro tem que passar pelo pipeline — se algum escapasse, a
      // bagunça reapareceria piscando no vídeo final.
      expect(progress.length).toBe(10);
      expect(progress.at(-1)).toBe(10);

      // Meio do vídeo: a essa altura o retângulo já andou ~30px, então esta
      // caixa só cobre a bagunça se a detecção acompanhou o movimento.
      const atMs = 500;
      const box = { x: PATCH.x + 30, y: PATCH.y, width: PATCH.width, height: PATCH.height };
      const { buffer: before } = await extractGrayscaleFrame(sourcePath, atMs, WIDTH, HEIGHT);
      const { buffer: after } = await extractGrayscaleFrame(outputPath, atMs, WIDTH, HEIGHT);

      const varianceBefore = variance(before, WIDTH, box);
      const varianceAfter = variance(after, WIDTH, box);
      expect(varianceBefore).toBeGreaterThan(1000);
      // Uma queda de ordens de grandeza: a região passa de xadrez de alto
      // contraste a superfície praticamente lisa.
      expect(varianceAfter).toBeLessThan(varianceBefore / 100);
    },
    120_000,
  );

  it(
    "não mexe num vídeo já limpo",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-fbf-clean-"));
      const sourcePath = join(dir, "plain.mp4");
      const outputPath = join(dir, "out.mp4");

      // Mesmo gerador, sem bagunça: retângulo de área zero.
      await generateMovingClutteredTestVideo(
        sourcePath,
        { width: WIDTH, height: HEIGHT },
        { x: 0, y: 0, width: 0, height: 0, driftPxPerSec: 0 },
        1,
        10,
      );

      const cleaner = new FrameByFrameCleaner(MODEL_PATH);
      const { framesChanged } = await cleaner.clean(sourcePath, outputPath);

      expect(framesChanged).toBe(0);
      expect((await readVideoMetadata(outputPath)).width).toBe(WIDTH);
    },
    120_000,
  );
});
