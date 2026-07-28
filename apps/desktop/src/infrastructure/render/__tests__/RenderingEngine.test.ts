import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { generateTiltedTestVideo } from "../../../test-support/generateTiltedTestVideo.js";
import { measureAverageLuma } from "../../ffmpeg/measureAverageLuma.js";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { FFMPEG_PATH } from "../../ffmpeg/paths.js";
import { LightingAnalyzeCapability } from "../../capabilities/LightingAnalyzeCapability.js";
import { LightingActCapability } from "../../capabilities/LightingActCapability.js";
import { QualitySharpenCapability } from "../../capabilities/QualitySharpenCapability.js";
import { HomeStagingActCapability } from "../../capabilities/HomeStagingActCapability.js";
import { ColorActCapability, type ColorProfile } from "../../capabilities/ColorActCapability.js";
import { PerspectiveAnalyzeCapability } from "../../capabilities/PerspectiveAnalyzeCapability.js";
import { PerspectiveActCapability } from "../../capabilities/PerspectiveActCapability.js";
import { RenderingEngine } from "../RenderingEngine.js";

const execFileAsync = promisify(execFile);

async function generateSolidPng(outputPath: string, color: string, size: string): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=${color}:size=${size}:d=1`,
    "-frames:v",
    "1",
    "-update",
    "1",
    outputPath,
  ]);
}

const ALL_COLOR_PROFILES: ColorProfile[] = [
  "warm",
  "minimal",
  "luxury",
  "modern",
  "industrial",
  "beach",
  "scandinavian",
  "corporate",
];

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

  it("aplica o filtro real de nitidez (unsharp) sem erro, produzindo um vídeo válido", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-render-sharpen-"));
    const sourcePath = join(dir, "original.mp4");
    const outputPath = join(dir, "nitido.mp4");
    await generateTestVideo(sourcePath, [{ color: "gray", durationSec: 1 }]);

    const sharpen = await new QualitySharpenCapability().execute();
    const engine = new RenderingEngine();
    await engine.render({ sourcePath, outputPath, filters: [sharpen.output.ffmpegFilter] });

    const outputMeta = await readVideoMetadata(outputPath);
    expect(outputMeta.durationMs).toBeGreaterThan(0);
  });

  it.each(ALL_COLOR_PROFILES)(
    "aplica o filtro real do perfil de cor '%s' sem erro, produzindo um vídeo válido",
    async (profile) => {
      const dir = mkdtempSync(join(tmpdir(), `digify-render-color-${profile}-`));
      const sourcePath = join(dir, "original.mp4");
      const outputPath = join(dir, "colorido.mp4");
      await generateTestVideo(sourcePath, [{ color: "gray", durationSec: 1 }]);

      const color = await new ColorActCapability().execute({ profile });
      const engine = new RenderingEngine();
      await engine.render({ sourcePath, outputPath, filters: [color.output.ffmpegFilter] });

      const outputMeta = await readVideoMetadata(outputPath);
      expect(outputMeta.durationMs).toBeGreaterThan(0);
    },
  );

  it("aplica de verdade a correção de horizonte (rotate+crop+scale) sobre um vídeo com inclinação conhecida", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-render-perspective-"));
    const sourcePath = join(dir, "tilt-10.mp4");
    const outputPath = join(dir, "nivelado.mp4");
    await generateTiltedTestVideo(sourcePath, 10, { width: 320, height: 240 });

    const analyze = await new PerspectiveAnalyzeCapability().execute({
      filePath: sourcePath,
      atMs: 500,
      frameWidth: 320,
      frameHeight: 240,
    });
    expect(analyze.output.tiltDegrees).toBe(10);

    const act = await new PerspectiveActCapability().execute({
      ...analyze.output,
      frameWidth: 320,
      frameHeight: 240,
    });
    expect(act.output.needsCorrection).toBe(true);

    const engine = new RenderingEngine();
    await engine.render({
      sourcePath,
      outputPath,
      filters: [act.output.ffmpegFilter as string],
    });

    const outputMeta = await readVideoMetadata(outputPath);
    expect(outputMeta.durationMs).toBeGreaterThan(0);
    // O filtro reescala de volta para o tamanho original — sem essa etapa a
    // resolução mudaria a cada correção.
    expect(outputMeta.width).toBe(320);
    expect(outputMeta.height).toBe(240);
  });

  it("aplica de verdade uma tentativa de remoção (delogo) de objeto temporário detectado (fallback, sem modelo real)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-render-staging-"));
    const sourcePath = join(dir, "com-bagunca.mp4");
    const outputPath = join(dir, "sem-bagunca.mp4");
    await generateTestVideo(sourcePath, [{ color: "gray", durationSec: 1 }], { size: "320x240" });

    const staging = await new HomeStagingActCapability().execute({
      filePath: sourcePath,
      atMs: 500,
      frameWidth: 320,
      frameHeight: 240,
      sceneStartMs: 0,
      sceneEndMs: 1000,
      temporaryObjects: [{ x: 50, y: 50, width: 40, height: 40 }],
    });

    expect(staging.output.usedRealInpainting).toBe(false);

    const engine = new RenderingEngine();
    await engine.render({ sourcePath, outputPath, filters: staging.output.legacyFilters });

    const outputMeta = await readVideoMetadata(outputPath);
    expect(outputMeta.durationMs).toBeGreaterThan(0);
    expect(outputMeta.width).toBe(320);
  });

  it("compõe de verdade um overlay de imagem estática sobre o vídeo, só na janela de tempo pedida", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-render-overlay-"));
    const sourcePath = join(dir, "preto.mp4");
    const outputPath = join(dir, "com-patch.mp4");
    const patchPath = join(dir, "patch-branco.png");
    await generateTestVideo(sourcePath, [{ color: "black", durationSec: 2 }], { size: "320x240" });
    await generateSolidPng(patchPath, "white", "100x100");

    const engine = new RenderingEngine();
    await engine.render({
      sourcePath,
      outputPath,
      filters: [],
      overlays: [{ imagePath: patchPath, x: 20, y: 20, startSec: 0, endSec: 2 }],
    });

    const outputMeta = await readVideoMetadata(outputPath);
    expect(outputMeta.durationMs).toBeGreaterThan(0);
    expect(outputMeta.width).toBe(320);

    // Dentro da região do patch (branco) a luma deve ficar bem alta; fora
    // dela, o vídeo original (preto) deve continuar preto -- prova real de
    // que o overlay foi composto na posição certa, não o frame inteiro.
    const insidePatchPath = join(dir, "dentro-do-patch.mp4");
    await execFileAsync(FFMPEG_PATH, [
      "-y",
      "-i",
      outputPath,
      "-vf",
      "crop=50:50:30:30",
      insidePatchPath,
    ]);
    const outsidePatchPath = join(dir, "fora-do-patch.mp4");
    await execFileAsync(FFMPEG_PATH, [
      "-y",
      "-i",
      outputPath,
      "-vf",
      "crop=50:50:250:150",
      outsidePatchPath,
    ]);

    const lumaInsidePatch = await measureAverageLuma(insidePatchPath);
    const lumaOutsidePatch = await measureAverageLuma(outsidePatchPath);
    expect(lumaInsidePatch).toBeGreaterThan(200);
    expect(lumaOutsidePatch).toBeLessThan(30);
  }, 20_000);
});
