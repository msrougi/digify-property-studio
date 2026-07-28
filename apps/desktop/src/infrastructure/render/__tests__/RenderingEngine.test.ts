import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { measureAverageLuma } from "../../ffmpeg/measureAverageLuma.js";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { LightingAnalyzeCapability } from "../../capabilities/LightingAnalyzeCapability.js";
import { LightingActCapability } from "../../capabilities/LightingActCapability.js";
import { RenderingEngine } from "../RenderingEngine.js";

describe("RenderingEngine", () => {
  it("aplica a correção de brilho decidida e o vídeo de saída fica mensuravelmente mais claro", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-render-"));
    const sourcePath = join(dir, "escuro.mp4");
    const outputPath = join(dir, "corrigido.mp4");
    await generateTestVideo(sourcePath, [{ color: "black", durationSec: 1 }]);

    const analyze = await new LightingAnalyzeCapability().execute({ filePath: sourcePath });
    const act = await new LightingActCapability().execute(analyze.output);
    expect(act.output.needsCorrection).toBe(true);

    const engine = new RenderingEngine();
    const { outputPath: renderedPath } = await engine.render({
      sourcePath,
      outputPath,
      filters: [act.output.ffmpegFilter as string],
    });

    const lumaBefore = analyze.output.averageLuma;
    const lumaAfter = await measureAverageLuma(renderedPath);

    expect(lumaAfter).toBeGreaterThan(lumaBefore + 20);
  });

  it("sem filtros, produz um vídeo de saída real equivalente ao original (duração preservada)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-render-copy-"));
    const sourcePath = join(dir, "original.mp4");
    const outputPath = join(dir, "copia.mp4");
    await generateTestVideo(sourcePath, [{ color: "gray", durationSec: 2 }]);

    const engine = new RenderingEngine();
    await engine.render({ sourcePath, outputPath, filters: [] });

    const originalMeta = await readVideoMetadata(sourcePath);
    const outputMeta = await readVideoMetadata(outputPath);

    expect(outputMeta.durationMs).toBeGreaterThanOrEqual(originalMeta.durationMs - 200);
    expect(outputMeta.durationMs).toBeLessThanOrEqual(originalMeta.durationMs + 200);
  });

  it("combina lighting + color em uma única cadeia de filtros real", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-render-combo-"));
    const sourcePath = join(dir, "escuro.mp4");
    const outputPath = join(dir, "corrigido-warm.mp4");
    await generateTestVideo(sourcePath, [{ color: "black", durationSec: 1 }]);

    const analyze = await new LightingAnalyzeCapability().execute({ filePath: sourcePath });
    const lightingAct = await new LightingActCapability().execute(analyze.output);

    const engine = new RenderingEngine();
    await engine.render({
      sourcePath,
      outputPath,
      filters: [lightingAct.output.ffmpegFilter as string, "eq=saturation=1.1"],
    });

    const lumaAfter = await measureAverageLuma(outputPath);
    expect(lumaAfter).toBeGreaterThan(analyze.output.averageLuma);
  });
});
