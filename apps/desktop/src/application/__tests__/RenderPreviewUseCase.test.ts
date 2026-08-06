import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  openDatabase,
  SqliteObjectRepository,
  SqliteProjectRepository,
  SqliteRenderRepository,
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
      new SqliteRenderRepository(db),
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
      new SqliteRenderRepository(db),
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

  it("persiste o render pra ele ser reencontrado depois — o usuário importa, revisa, sai e volta achando a comparação onde deixou", async () => {
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
    const renderRepository = new SqliteRenderRepository(db);

    const registry = new CapabilityRegistry();
    registry.register(new LightingAnalyzeCapability());
    registry.register(new LightingActCapability());
    registry.register(new ColorActCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    // Nada guardado antes de rodar.
    expect(await renderRepository.findByProject("p1")).toBeNull();

    const result = await new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      dir,
      sceneRepository,
      objectRepository,
      renderRepository,
    ).execute({ projectId: "p1", colorProfile: "warm" });

    // Lido de um repositório NOVO sobre o mesmo banco — prova que veio do
    // disco, não de estado em memória sobrando da chamada anterior.
    const saved = await new SqliteRenderRepository(db).findByProject("p1");
    expect(saved).not.toBeNull();
    const props = saved!.toProps();
    expect(props.outputPath).toBe(result.outputPath);
    expect(props.appliedCorrections).toEqual(result.appliedCorrections);
  });

  it("reaplicar melhorias substitui o render anterior em vez de acumular", async () => {
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
    const renderRepository = new SqliteRenderRepository(db);

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
      renderRepository,
    );

    await useCase.execute({ projectId: "p1", colorProfile: "warm" });
    const second = await useCase.execute({
      projectId: "p1",
      colorProfile: "luxury",
      applySharpen: true,
    });

    const saved = await renderRepository.findByProject("p1");
    expect(saved?.toProps().appliedCorrections).toEqual(second.appliedCorrections);
    const rows = db.prepare("SELECT COUNT(*) AS total FROM renders").get() as { total: number };
    expect(rows.total).toBe(1);
  });

  it("com limpeza quadro a quadro disponível: limpa primeiro, renderiza a partir do vídeo limpo e descarta o intermediário", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    await projectRepository.save(
      Project.create({
        id: "p1",
        name: "Casa Bagunçada",
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
    // Registrada de propósito: se o caso de uso ainda caísse no caminho por
    // cena, o teste passaria sem provar nada. Como não há cena nenhuma no
    // banco, aquele caminho não produziria correção alguma.
    registry.register(new HomeStagingActCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    // Dublê da limpeza (o modelo real de 196MB é exercitado no teste do
    // FrameByFrameCleaner). Aqui o que está sob teste é a ORQUESTRAÇÃO:
    // a ordem das etapas, qual vídeo alimenta o render e o descarte.
    const cleanedFromSource: string[] = [];
    const discarded: string[] = [];
    let cleanedPath = "";
    const fakeCleaner = {
      isAvailable: () => true,
      clean: async (source: string, output: string, onProgress?: (p: {
        framesProcessed: number;
        totalFrames: number;
        framesChanged: number;
      }) => void) => {
        cleanedFromSource.push(source);
        cleanedPath = output;
        // Produz um vídeo de verdade no caminho pedido — o render seguinte
        // vai mesmo tentar ler esse arquivo.
        await generateTestVideo(output, [{ color: "gray", durationSec: 1 }]);
        onProgress?.({ framesProcessed: 5, totalFrames: 10, framesChanged: 5 });
        return { framesProcessed: 10, framesChanged: 7 };
      },
      discard: async (path: string) => {
        discarded.push(path);
      },
    };

    const stagesSeen: string[] = [];
    const useCase = new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      dir,
      sceneRepository,
      objectRepository,
      new SqliteRenderRepository(db),
      fakeCleaner,
    );

    const result = await useCase.execute(
      { projectId: "p1", colorProfile: "warm", applyHomeStaging: true },
      (progress) => {
        if (stagesSeen.at(-1) !== progress.stage) stagesSeen.push(progress.stage);
      },
    );

    // A limpeza parte do vídeo original do usuário...
    expect(cleanedFromSource).toEqual([sourcePath]);
    // ...e o render final parte do vídeo já limpo, não do original.
    expect(discarded).toEqual([cleanedPath]);
    expect(cleanedPath).not.toBe(sourcePath);

    expect(stagesSeen[1]).toBe("Limpando a bagunça com IA (quadro a quadro)");
    expect(stagesSeen.at(-1)).toBe("Renderizando vídeo final");
    expect(result.appliedCorrections.join(" ")).toContain("7 de 10 quadros");
  });

  it("sem o modelo montado, mantém o caminho antigo por cena", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    await projectRepository.save(
      Project.create({
        id: "p1",
        name: "Casa",
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
    registry.register(new HomeStagingActCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    let cleanCalled = false;
    const stagesSeen: string[] = [];
    const useCase = new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      dir,
      sceneRepository,
      objectRepository,
      new SqliteRenderRepository(db),
      {
        isAvailable: () => false,
        clean: async () => {
          cleanCalled = true;
          return { framesProcessed: 0, framesChanged: 0 };
        },
        discard: async () => {},
      },
    );

    await useCase.execute(
      { projectId: "p1", colorProfile: "warm", applyHomeStaging: true },
      (progress) => {
        if (stagesSeen.at(-1) !== progress.stage) stagesSeen.push(progress.stage);
      },
    );

    expect(cleanCalled).toBe(false);
    expect(stagesSeen).toContain("Removendo itens temporários");
    expect(stagesSeen).not.toContain("Limpando a bagunça com IA (quadro a quadro)");
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
      new SqliteRenderRepository(db),
    );

    await expect(
      useCase.execute({ projectId: "inexistente", colorProfile: "warm" }),
    ).rejects.toThrow(/não encontrado/);
  });
});
