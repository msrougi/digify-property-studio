import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase, SqliteProjectRepository, SqliteSceneRepository } from "@digify/database";
import { Project } from "@digify/domain";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { generateTestVideo } from "../../test-support/generateTestVideo.js";
import { readVideoMetadata } from "../../infrastructure/ffmpeg/ffprobeMetadata.js";
import { SceneDetectCapability } from "../../infrastructure/capabilities/SceneDetectCapability.js";
import { DetectScenesUseCase } from "../DetectScenesUseCase.js";

describe("DetectScenesUseCase", () => {
  let db: Database.Database;
  let videoPath: string;
  let durationMs: number;
  let idSequence: number;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    const dir = mkdtempSync(join(tmpdir(), "digify-detect-scenes-"));
    videoPath = join(dir, "duas-cenas.mp4");
    await generateTestVideo(videoPath, [
      { color: "red", durationSec: 2 },
      { color: "blue", durationSec: 2 },
    ]);
    durationMs = (await readVideoMetadata(videoPath)).durationMs;
    idSequence = 0;
  });

  afterEach(() => {
    db.close();
  });

  function buildUseCase() {
    const sceneRepository = new SqliteSceneRepository(db);
    const registry = new CapabilityRegistry();
    registry.register(new SceneDetectCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());
    return {
      sceneRepository,
      detectScenes: new DetectScenesUseCase(
        pie,
        sceneRepository,
        () => `scene-${++idSequence}`,
      ),
    };
  }

  it("detecta e persiste cenas reais de um vídeo com corte real", async () => {
    const { detectScenes, sceneRepository } = buildUseCase();

    await new SqliteProjectRepository(db).save(
      Project.create({
        id: "p1",
        name: "Duas Cenas",
        sourceVideoPath: videoPath,
        sourceVideoHash: "hash-fixture",
        video: { durationMs, width: 64, height: 64, fps: 10, codecName: "h264", hasAudio: false },
      }),
    );

    const scenes = await detectScenes.execute({
      projectId: "p1",
      filePath: videoPath,
      durationMs,
    });

    expect(scenes).toHaveLength(2);

    const persisted = await sceneRepository.findByProject("p1");
    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.toProps().startMs).toBe(0);
    expect(persisted[persisted.length - 1]?.toProps().endMs).toBe(durationMs);
  });
});
