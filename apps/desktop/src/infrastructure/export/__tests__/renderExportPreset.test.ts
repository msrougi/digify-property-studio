import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { renderExportPreset } from "../renderExportPreset.js";
import { EXPORT_PRESETS } from "../exportPresets.js";

describe("renderExportPreset", () => {
  it("converte um vídeo horizontal (16:9) para o preset vertical do Reels (9:16) preenchendo o quadro inteiro", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-export-preset-"));
    const sourcePath = join(dir, "horizontal.mp4");
    const outputPath = join(dir, "reels.mp4");
    await generateTestVideo(sourcePath, [{ color: "blue", durationSec: 1 }], { size: "640x360" });

    await renderExportPreset(sourcePath, outputPath, EXPORT_PRESETS["instagram_reels"] as never);

    const meta = await readVideoMetadata(outputPath);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
    expect(meta.durationMs).toBeGreaterThan(0);
  });

  it("converte para o preset quadrado do Instagram Feed (1:1)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-export-preset-square-"));
    const sourcePath = join(dir, "horizontal.mp4");
    const outputPath = join(dir, "feed.mp4");
    await generateTestVideo(sourcePath, [{ color: "green", durationSec: 1 }], { size: "640x360" });

    await renderExportPreset(sourcePath, outputPath, EXPORT_PRESETS["instagram_feed"] as never);

    const meta = await readVideoMetadata(outputPath);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it("mantém o preset horizontal do YouTube em 1920x1080 mesmo a partir de um vídeo vertical", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-export-preset-yt-"));
    const sourcePath = join(dir, "vertical.mp4");
    const outputPath = join(dir, "youtube.mp4");
    await generateTestVideo(sourcePath, [{ color: "red", durationSec: 1 }], { size: "360x640" });

    await renderExportPreset(sourcePath, outputPath, EXPORT_PRESETS["youtube"] as never);

    const meta = await readVideoMetadata(outputPath);
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
  });
});
