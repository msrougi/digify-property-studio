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
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { generateTestVideo } from "../../test-support/generateTestVideo.js";
import { IntakeCapability } from "../../infrastructure/capabilities/IntakeCapability.js";
import { SceneDetectCapability } from "../../infrastructure/capabilities/SceneDetectCapability.js";
import { RoomRecognizeCapability } from "../../infrastructure/capabilities/RoomRecognizeCapability.js";
import { ObjectDetectCapability } from "../../infrastructure/capabilities/ObjectDetectCapability.js";
import { LightingAnalyzeCapability } from "../../infrastructure/capabilities/LightingAnalyzeCapability.js";
import { PropertyScoreCapability } from "../../infrastructure/capabilities/PropertyScoreCapability.js";
import { ImportVideoUseCase } from "../ImportVideoUseCase.js";
import { DetectScenesUseCase } from "../DetectScenesUseCase.js";
import { RecognizeRoomsUseCase } from "../RecognizeRoomsUseCase.js";
import { DetectObjectsUseCase } from "../DetectObjectsUseCase.js";
import { PropertyScoreUseCase } from "../PropertyScoreUseCase.js";
import { ImportAndAnalyzeVideoUseCase } from "../ImportAndAnalyzeVideoUseCase.js";

const MODELS_DIR = join(__dirname, "..", "..", "..", "models");

describe("ImportAndAnalyzeVideoUseCase", () => {
  let db: Database.Database;
  let videoPath: string;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    const dir = mkdtempSync(join(tmpdir(), "digify-import-analyze-"));
    videoPath = join(dir, "cobertura-duas-cenas.mp4");
    await generateTestVideo(videoPath, [
      { color: "red", durationSec: 2 },
      { color: "blue", durationSec: 2 },
    ]);
  });

  afterEach(() => {
    db.close();
  });

  it("importa, analisa (cenas + ambientes + objetos + score) e deixa o projeto pronto para revisão", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);
    const registry = new CapabilityRegistry();
    registry.register(new IntakeCapability());
    registry.register(new SceneDetectCapability());
    registry.register(
      new RoomRecognizeCapability(
        join(MODELS_DIR, "mobilenetv2-12.onnx"),
        join(MODELS_DIR, "room_classifier_head.onnx"),
      ),
    );
    registry.register(new ObjectDetectCapability(join(MODELS_DIR, "yolox_nano.onnx")));
    registry.register(new LightingAnalyzeCapability());
    registry.register(new PropertyScoreCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    let sceneIdSequence = 0;
    let objectIdSequence = 0;
    const importVideo = new ImportVideoUseCase(pie, projectRepository, () => "p1");
    const detectScenes = new DetectScenesUseCase(
      pie,
      sceneRepository,
      () => `s${++sceneIdSequence}`,
    );
    const recognizeRooms = new RecognizeRoomsUseCase(pie, sceneRepository);
    const detectObjects = new DetectObjectsUseCase(
      pie,
      objectRepository,
      () => `o${++objectIdSequence}`,
    );
    const computePropertyScore = new PropertyScoreUseCase(pie, sceneRepository, objectRepository);
    const useCase = new ImportAndAnalyzeVideoUseCase(
      importVideo,
      detectScenes,
      recognizeRooms,
      detectObjects,
      computePropertyScore,
      projectRepository,
    );

    const { project, scenes, propertyScore } = await useCase.execute({ filePath: videoPath });

    expect(project.status).toBe("ready_for_review");
    expect(scenes.length).toBeGreaterThanOrEqual(1);
    // Vídeo sintético de cor sólida não é um cômodo real — o importante aqui é
    // que a capability rodou e persistiu *algum* roomType, não qual.
    expect(scenes.every((scene) => scene.toProps().roomType !== null)).toBe(true);
    expect(propertyScore.score).toBeGreaterThanOrEqual(0);
    expect(propertyScore.score).toBeLessThanOrEqual(100);

    const persistedProject = await projectRepository.findById("p1");
    expect(persistedProject?.status).toBe("ready_for_review");

    const persistedScenes = await sceneRepository.findByProject("p1");
    expect(persistedScenes.length).toBe(scenes.length);
    expect(persistedScenes.every((scene) => scene.toProps().roomType !== null)).toBe(true);
  }, 30_000);

  it("reporta progresso real nas 5 etapas, em ordem, terminando a última em 100%", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);
    const registry = new CapabilityRegistry();
    registry.register(new IntakeCapability());
    registry.register(new SceneDetectCapability());
    registry.register(
      new RoomRecognizeCapability(
        join(MODELS_DIR, "mobilenetv2-12.onnx"),
        join(MODELS_DIR, "room_classifier_head.onnx"),
      ),
    );
    registry.register(new ObjectDetectCapability(join(MODELS_DIR, "yolox_nano.onnx")));
    registry.register(new LightingAnalyzeCapability());
    registry.register(new PropertyScoreCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    let sceneIdSequence = 0;
    let objectIdSequence = 0;
    const useCase = new ImportAndAnalyzeVideoUseCase(
      new ImportVideoUseCase(pie, projectRepository, () => "p2"),
      new DetectScenesUseCase(pie, sceneRepository, () => `s${++sceneIdSequence}`),
      new RecognizeRoomsUseCase(pie, sceneRepository),
      new DetectObjectsUseCase(pie, objectRepository, () => `o${++objectIdSequence}`),
      new PropertyScoreUseCase(pie, sceneRepository, objectRepository),
      projectRepository,
    );

    const updates: { stage: string; stageIndex: number; totalStages: number; percent: number }[] = [];
    await useCase.execute({ filePath: videoPath }, (progress) => updates.push(progress));

    const stageNames = updates.map((u) => u.stage);
    expect(stageNames).toEqual([
      "Importando vídeo",
      "Importando vídeo",
      "Detectando cenas",
      "Detectando cenas",
      "Reconhecendo cômodos",
      "Reconhecendo cômodos",
      "Detectando objetos",
      "Detectando objetos",
      "Calculando Property Score",
      "Calculando Property Score",
    ]);
    expect(updates.every((u) => u.totalStages === 5)).toBe(true);
    expect(updates[updates.length - 1]?.percent).toBe(100);
  }, 30_000);
});
