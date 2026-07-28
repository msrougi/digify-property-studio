import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  openDatabase,
  SqliteProjectRepository,
  SqliteSceneRepository,
} from "@digify/database";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { generateTestVideo } from "../../test-support/generateTestVideo.js";
import { IntakeCapability } from "../../infrastructure/capabilities/IntakeCapability.js";
import { SceneDetectCapability } from "../../infrastructure/capabilities/SceneDetectCapability.js";
import { RoomRecognizeCapability } from "../../infrastructure/capabilities/RoomRecognizeCapability.js";
import { ImportVideoUseCase } from "../ImportVideoUseCase.js";
import { DetectScenesUseCase } from "../DetectScenesUseCase.js";
import { RecognizeRoomsUseCase } from "../RecognizeRoomsUseCase.js";
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

  it("importa, analisa (cenas + ambientes) e deixa o projeto pronto para revisão", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);
    const registry = new CapabilityRegistry();
    registry.register(new IntakeCapability());
    registry.register(new SceneDetectCapability());
    registry.register(
      new RoomRecognizeCapability(
        join(MODELS_DIR, "mobilenetv2-12.onnx"),
        join(MODELS_DIR, "room_classifier_head.onnx"),
      ),
    );
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    let sceneIdSequence = 0;
    const importVideo = new ImportVideoUseCase(pie, projectRepository, () => "p1");
    const detectScenes = new DetectScenesUseCase(
      pie,
      sceneRepository,
      () => `s${++sceneIdSequence}`,
    );
    const recognizeRooms = new RecognizeRoomsUseCase(pie, sceneRepository);
    const useCase = new ImportAndAnalyzeVideoUseCase(
      importVideo,
      detectScenes,
      recognizeRooms,
      projectRepository,
    );

    const { project, scenes } = await useCase.execute({ filePath: videoPath });

    expect(project.status).toBe("ready_for_review");
    expect(scenes.length).toBeGreaterThanOrEqual(1);
    // Vídeo sintético de cor sólida não é um cômodo real — o importante aqui é
    // que a capability rodou e persistiu *algum* roomType, não qual.
    expect(scenes.every((scene) => scene.toProps().roomType !== null)).toBe(true);

    const persistedProject = await projectRepository.findById("p1");
    expect(persistedProject?.status).toBe("ready_for_review");

    const persistedScenes = await sceneRepository.findByProject("p1");
    expect(persistedScenes.length).toBe(scenes.length);
    expect(persistedScenes.every((scene) => scene.toProps().roomType !== null)).toBe(true);
  }, 20_000);
});
