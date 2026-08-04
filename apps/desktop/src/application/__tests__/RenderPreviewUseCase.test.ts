import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  openDatabase,
  SqliteObjectRepository,
  SqliteProjectRepository,
  SqliteSceneRepository,
} from "@digify/database";
import { DetectedObject, Project, Scene } from "@digify/domain";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { generateTestVideo } from "../../test-support/generateTestVideo.js";
import { measureAverageLuma } from "../../infrastructure/ffmpeg/measureAverageLuma.js";
import { LightingAnalyzeCapability } from "../../infrastructure/capabilities/LightingAnalyzeCapability.js";
import { LightingActCapability } from "../../infrastructure/capabilities/LightingActCapability.js";
import { ColorActCapability } from "../../infrastructure/capabilities/ColorActCapability.js";
import { QualitySharpenCapability } from "../../infrastructure/capabilities/QualitySharpenCapability.js";
import { HomeStagingActCapability } from "../../infrastructure/capabilities/HomeStagingActCapability.js";
import { RenderingEngine } from "../../infrastructure/render/RenderingEngine.js";
import { RenderPreviewUseCase } from "../RenderPreviewUseCase.js";

describe("RenderPreviewUseCase", () => {
  let db: Database.Database;
  let dir: string;
  let sourcePath: string;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    dir = mkdtempSync(join(tmpdir(), "digify-render-preview-"));
    sourcePath = join(dir, "escuro.mp4");
    await generateTestVideo(sourcePath, [{ color: "black", durationSec: 1 }]);
  });

  afterEach(() => {
    db.close();
  });

  it("aplica lighting + color de ponta a ponta e produz um vídeo real corrigido", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    await projectRepository.save(
      Project.create({
        id: "p1",
        name: "Apartamento Escuro",
        sourceVideoPath: sourcePath,
        sourceVideoHash: "hash-fixture",
        video: { durationMs: 1000, width: 64, height: 64, fps: 10, codecName: "h264", hasAudio: false },
      }),
    );

    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);

    const scene = Scene.create({ id: "s1", projectId: "p1", startMs: 0, endMs: 1000 });
    await sceneRepository.saveMany([scene]);
    await objectRepository.saveMany([
      DetectedObject.create({
        id: "o1",
        sceneId: "s1",
        category: "temporary",
        boundingBox: { x: 5, y: 5, width: 10, height: 10 },
        confidence: 90,
      }),
    ]);

    const registry = new CapabilityRegistry();
    registry.register(new LightingAnalyzeCapability());
    registry.register(new LightingActCapability());
    registry.register(new ColorActCapability());
    registry.register(new QualitySharpenCapability());
    registry.register(new HomeStagingActCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    const useCase = new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      dir,
      sceneRepository,
      objectRepository,
    );

    const result = await useCase.execute({
      projectId: "p1",
      colorProfile: "warm",
      applySharpen: true,
      applyHomeStaging: true,
    });

    expect(result.outputPath).toBe(join(dir, "p1.mp4"));
    // lighting + color + sharpen + home staging (1 cena com 1 objeto temporário real)
    expect(result.appliedCorrections).toHaveLength(4);
    expect(result.appliedCorrections.some((c) => c.includes("item"))).toBe(true);

    const lumaAfter = await measureAverageLuma(result.outputPath);
    expect(lumaAfter).toBeGreaterThan(50); // era ~16 (preto), corrigido para cima
  });

  it("reporta progresso real por etapas (só as correções pedidas) e termina em 'Renderizando vídeo final' a 100%", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    await projectRepository.save(
      Project.create({
        id: "p1",
        name: "Apartamento Escuro",
        sourceVideoPath: sourcePath,
        sourceVideoHash: "hash-fixture",
        video: { durationMs: 1000, width: 64, height: 64, fps: 10, codecName: "h264", hasAudio: false },
      }),
    );
    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);

    const registry = new CapabilityRegistry();
    registry.register(new LightingAnalyzeCapability());
    registry.register(new LightingActCapability());
    registry.register(new ColorActCapability());
    registry.register(new QualitySharpenCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    const useCase = new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      dir,
      sceneRepository,
      objectRepository,
    );

    const updates: { stage: string; stageIndex: number; totalStages: number; percent: number }[] = [];
    await useCase.execute(
      { projectId: "p1", colorProfile: "warm", applySharpen: true },
      (progress) => updates.push(progress),
    );

    expect(updates.length).toBeGreaterThan(0);
    // Só 3 etapas nesta chamada: lighting+color, sharpen, render — nem reflexo
    // nem home staging nem perspectiva, porque não foram pedidos.
    const stageNames = [...new Set(updates.map((u) => u.stage))];
    expect(stageNames).toEqual([
      "Analisando iluminação e cor",
      "Aplicando nitidez",
      "Renderizando vídeo final",
    ]);
    expect(updates.every((u) => u.totalStages === 3)).toBe(true);
    const last = updates[updates.length - 1];
    expect(last?.stage).toBe("Renderizando vídeo final");
    expect(last?.percent).toBe(100);
  });

  it("lança erro de domínio quando o projeto não existe", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);
    const registry = new CapabilityRegistry();
    registry.register(new LightingAnalyzeCapability());
    registry.register(new LightingActCapability());
    registry.register(new ColorActCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());
    const useCase = new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      dir,
      sceneRepository,
      objectRepository,
    );

    await expect(
      useCase.execute({ projectId: "inexistente", colorProfile: "warm" }),
    ).rejects.toThrow(/não encontrado/);
  });
});
