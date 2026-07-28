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
import { LightingAnalyzeCapability } from "../../infrastructure/capabilities/LightingAnalyzeCapability.js";
import { ObjectDetectCapability } from "../../infrastructure/capabilities/ObjectDetectCapability.js";
import { PropertyScoreCapability } from "../../infrastructure/capabilities/PropertyScoreCapability.js";
import { DetectObjectsUseCase } from "../DetectObjectsUseCase.js";
import { PropertyScoreUseCase } from "../PropertyScoreUseCase.js";

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

describe("PropertyScoreUseCase", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("calcula um score real combinando exposição e objetos temporários já persistidos", async () => {
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
    registry.register(new LightingAnalyzeCapability());
    registry.register(new PropertyScoreCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());

    // Popula objetos persistidos de verdade primeiro (mesmo fluxo do app real).
    await new DetectObjectsUseCase(pie, objectRepository, () => "o1").execute({
      projectId: "p1",
      filePath: FIXTURE_PATH,
      frameWidth: 320,
      frameHeight: 240,
      scenes: [scene],
    });

    const useCase = new PropertyScoreUseCase(pie, sceneRepository, objectRepository);
    const result = await useCase.execute({ projectId: "p1", filePath: FIXTURE_PATH });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.lightingScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.suggestions)).toBe(true);
  }, 20_000);
});
