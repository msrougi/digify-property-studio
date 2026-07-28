import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase, SqliteProjectRepository, SqliteSceneRepository } from "@digify/database";
import { Project, Scene } from "@digify/domain";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { RoomRecognizeCapability } from "../../infrastructure/capabilities/RoomRecognizeCapability.js";
import { RecognizeRoomsUseCase } from "../RecognizeRoomsUseCase.js";

const MODELS_DIR = join(__dirname, "..", "..", "..", "models");
const FIXTURE_PATH = join(
  __dirname,
  "..",
  "..",
  "infrastructure",
  "capabilities",
  "__fixtures__",
  "kitchen-sample.mp4",
);

describe("RecognizeRoomsUseCase", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("reconhece o ambiente real de cada cena e persiste via Scene.assignRoom", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);

    await projectRepository.save(
      Project.create({
        id: "p1",
        name: "Cozinha",
        sourceVideoPath: FIXTURE_PATH,
        sourceVideoHash: "hash-fixture",
        video: { durationMs: 1000, width: 320, height: 240, fps: 25, codecName: "h264", hasAudio: false },
      }),
    );
    const scene = Scene.create({ id: "s1", projectId: "p1", startMs: 0, endMs: 1000 });
    await sceneRepository.saveMany([scene]);

    const registry = new CapabilityRegistry();
    registry.register(
      new RoomRecognizeCapability(
        join(MODELS_DIR, "mobilenetv2-12.onnx"),
        join(MODELS_DIR, "room_classifier_head.onnx"),
      ),
    );
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());
    const useCase = new RecognizeRoomsUseCase(pie, sceneRepository);

    const result = await useCase.execute({
      projectId: "p1",
      filePath: FIXTURE_PATH,
      scenes: [scene],
    });

    expect(result[0]?.toProps().roomType).toBe("kitchen");

    const persisted = await sceneRepository.findByProject("p1");
    expect(persisted[0]?.toProps().roomType).toBe("kitchen");
    expect(persisted[0]?.toProps().roomConfidence).toBeGreaterThan(50);
  }, 20_000);
});
