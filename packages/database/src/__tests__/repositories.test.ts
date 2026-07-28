import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { DetectedObject, Project, Scene, Confidence, type VideoMetadataProps } from "@digify/domain";
import { openDatabase } from "../connection.js";
import { SqliteProjectRepository } from "../repositories/SqliteProjectRepository.js";
import { SqliteSceneRepository } from "../repositories/SqliteSceneRepository.js";
import { SqliteObjectRepository } from "../repositories/SqliteObjectRepository.js";

const SAMPLE_VIDEO: VideoMetadataProps = {
  durationMs: 45_000,
  width: 1920,
  height: 1080,
  fps: 29.97,
  codecName: "h264",
  hasAudio: true,
};

describe("Sqlite repositories", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("persiste e recupera um projeto", async () => {
    const repo = new SqliteProjectRepository(db);
    const project = Project.create({
      id: "p1",
      name: "Cobertura Itaim",
      sourceVideoPath: "/videos/itaim.mp4",
      sourceVideoHash: "hash-1",
      video: SAMPLE_VIDEO,
    });

    await repo.save(project);
    const found = await repo.findById("p1");

    expect(found).not.toBeNull();
    expect(found?.toProps().name).toBe("Cobertura Itaim");
    expect(found?.status).toBe("importing");
  });

  it("persiste e recupera os metadados reais de vídeo (ffprobe)", async () => {
    const repo = new SqliteProjectRepository(db);
    const project = Project.create({
      id: "p1",
      name: "Cobertura Itaim",
      sourceVideoPath: "/videos/itaim.mp4",
      sourceVideoHash: "hash-1",
      video: SAMPLE_VIDEO,
    });

    await repo.save(project);
    const found = await repo.findById("p1");

    expect(found?.toProps().video).toEqual(SAMPLE_VIDEO);
  });

  it("atualiza status em save subsequente (upsert)", async () => {
    const repo = new SqliteProjectRepository(db);
    const project = Project.create({
      id: "p1",
      name: "Cobertura Itaim",
      sourceVideoPath: "/videos/itaim.mp4",
      sourceVideoHash: "hash-1",
      video: SAMPLE_VIDEO,
    });

    await repo.save(project);
    project.transitionTo("analyzing");
    await repo.save(project);

    const found = await repo.findById("p1");
    expect(found?.status).toBe("analyzing");
  });

  it("persiste cenas vinculadas a um projeto e recupera ordenadas por tempo", async () => {
    const projectRepo = new SqliteProjectRepository(db);
    const sceneRepo = new SqliteSceneRepository(db);

    const project = Project.create({
      id: "p1",
      name: "Cobertura Itaim",
      sourceVideoPath: "/videos/itaim.mp4",
      sourceVideoHash: "hash-1",
      video: SAMPLE_VIDEO,
    });
    await projectRepo.save(project);

    const sceneB = Scene.create({ id: "s2", projectId: "p1", startMs: 5000, endMs: 9000 });
    sceneB.assignRoom("kitchen", Confidence.of(91));
    const sceneA = Scene.create({ id: "s1", projectId: "p1", startMs: 0, endMs: 5000 });
    sceneA.assignRoom("living_room", Confidence.of(97));

    await sceneRepo.saveMany([sceneB, sceneA]);

    const scenes = await sceneRepo.findByProject("p1");
    expect(scenes.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(scenes[0]?.toProps().roomType).toBe("living_room");
  });

  it("objetos estruturais persistem como não removíveis", async () => {
    const projectRepo = new SqliteProjectRepository(db);
    const sceneRepo = new SqliteSceneRepository(db);
    const objectRepo = new SqliteObjectRepository(db);

    await projectRepo.save(
      Project.create({
        id: "p1",
        name: "Cobertura Itaim",
        sourceVideoPath: "/videos/itaim.mp4",
        sourceVideoHash: "hash-1",
        video: SAMPLE_VIDEO,
      }),
    );
    await sceneRepo.saveMany([Scene.create({ id: "s1", projectId: "p1", startMs: 0, endMs: 5000 })]);

    const wall = DetectedObject.create({
      id: "o1",
      sceneId: "s1",
      category: "structural",
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      confidence: 99,
    });
    await objectRepo.saveMany([wall]);

    const objects = await objectRepo.findByScene("s1");
    expect(objects).toHaveLength(1);
    expect(objects[0]?.toProps().removable).toBe(false);
  });
});
