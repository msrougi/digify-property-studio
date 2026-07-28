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
import { Project } from "@digify/domain";
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
    // lighting + color + sharpen + home staging (sem objetos temporários, mas ainda reporta a decisão)
    expect(result.appliedCorrections).toHaveLength(4);

    const lumaAfter = await measureAverageLuma(result.outputPath);
    expect(lumaAfter).toBeGreaterThan(50); // era ~16 (preto), corrigido para cima
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
