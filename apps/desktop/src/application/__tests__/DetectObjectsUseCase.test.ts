import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  openDatabase,
  SqliteObjectRepository,
  SqliteProjectRepository,
  SqliteSceneRepository,
} from "@digify/database";
import { Project, Scene } from "@digify/domain";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { ObjectDetectCapability } from "../../infrastructure/capabilities/ObjectDetectCapability.js";
import { DetectObjectsUseCase } from "../DetectObjectsUseCase.js";

const MODEL_PATH = join(__dirname, "..", "..", "..", "models", "yolox_nano.onnx");
const FIXTURE_PATH = join(
  __dirname,
  "..",
  "..",
  "infrastructure",
  "capabilities",
  "__fixtures__",
  "kitchen-sample.mp4",
);

describe("DetectObjectsUseCase", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("detecta objetos reais numa cena e persiste, respeitando removable por categoria", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);

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
    registry.register(new ObjectDetectCapability(MODEL_PATH));
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());
    let idSequence = 0;
    const useCase = new DetectObjectsUseCase(pie, objectRepository, () => `o${++idSequence}`);

    const objects = await useCase.execute({
      projectId: "p1",
      filePath: FIXTURE_PATH,
      frameWidth: 320,
      frameHeight: 240,
      scenes: [scene],
    });

    expect(objects.length).toBeGreaterThan(0);
    const furniture = objects.filter((o) => o.toProps().category === "decorative");
    expect(furniture.length).toBeGreaterThan(0);
    expect(furniture.every((o) => o.toProps().removable === false)).toBe(true);

    const persisted = await objectRepository.findByScene("s1");
    expect(persisted.length).toBe(objects.length);
  }, 20_000);
});
