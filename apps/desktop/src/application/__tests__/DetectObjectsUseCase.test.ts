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
import { Confidence, Project, Scene } from "@digify/domain";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { ObjectDetectCapability } from "../../infrastructure/capabilities/ObjectDetectCapability.js";
import { ClutterDetectCapability } from "../../infrastructure/capabilities/ClutterDetectCapability.js";
import { generateVideoWithTexturedPatch } from "../../test-support/generateVideoWithTexturedPatch.js";
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

  it("bug real reportado por usuário: bagunça sem classe COCO (roupa/caixa amontoada) não é achada pelo object.detect, mas clutter.detect encontra mesmo assim numa cena indoor confiante", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-clutter-integration-"));
    const videoPath = join(dir, "quarto-bagunçado.mp4");
    const size = { width: 320, height: 240 };
    // Retângulo de alto contraste ocupando boa parte do chão — proxy real
    // pro "monte de roupa/caixa" da foto que o usuário mandou: sem forma de
    // objeto COCO nenhuma, só uma área que visivelmente destoa do resto.
    await generateVideoWithTexturedPatch(videoPath, size, { x: 40, y: 120, width: 240, height: 100 });

    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);

    await projectRepository.save(
      Project.create({
        id: "p2",
        name: "Quarto bagunçado",
        sourceVideoPath: videoPath,
        sourceVideoHash: "hash-fixture-2",
        video: { durationMs: 1000, width: size.width, height: size.height, fps: 10, codecName: "h264", hasAudio: false },
      }),
    );
    const scene = Scene.create({ id: "s2", projectId: "p2", startMs: 0, endMs: 1000 });
    // Simula uma cena indoor reconhecida com confiança (o que
    // RecognizeRoomsUseCase faria de verdade antes de DetectObjectsUseCase
    // rodar, no pipeline real) — sem depender do classificador real aqui,
    // só testando o gate + a detecção de bagunça em si.
    scene.assignRoom("bedroom", Confidence.of(85));
    await sceneRepository.saveMany([scene]);

    const registry = new CapabilityRegistry();
    registry.register(new ObjectDetectCapability(MODEL_PATH));
    registry.register(new ClutterDetectCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());
    let idSequence = 0;
    const useCase = new DetectObjectsUseCase(pie, objectRepository, () => `o${++idSequence}`);

    const objects = await useCase.execute({
      projectId: "p2",
      filePath: videoPath,
      frameWidth: size.width,
      frameHeight: size.height,
      scenes: [scene],
    });

    expect(objects.length).toBeGreaterThan(0);
    expect(objects.every((o) => o.toProps().category === "temporary")).toBe(true);
    expect(objects.every((o) => o.toProps().removable === true)).toBe(true);
  }, 30_000);

  it("nunca roda clutter.detect numa cena sem reconhecimento de ambiente confiante (roomConfidence null ou baixa — provável área externa)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-clutter-gate-"));
    const videoPath = join(dir, "sem-reconhecimento.mp4");
    const size = { width: 320, height: 240 };
    await generateVideoWithTexturedPatch(videoPath, size, { x: 40, y: 120, width: 240, height: 100 });

    const projectRepository = new SqliteProjectRepository(db);
    const sceneRepository = new SqliteSceneRepository(db);
    const objectRepository = new SqliteObjectRepository(db);

    await projectRepository.save(
      Project.create({
        id: "p3",
        name: "Sem reconhecimento",
        sourceVideoPath: videoPath,
        sourceVideoHash: "hash-fixture-3",
        video: { durationMs: 1000, width: size.width, height: size.height, fps: 10, codecName: "h264", hasAudio: false },
      }),
    );
    // roomType/roomConfidence continuam null — nunca passou por assignRoom.
    const scene = Scene.create({ id: "s3", projectId: "p3", startMs: 0, endMs: 1000 });
    await sceneRepository.saveMany([scene]);

    const registry = new CapabilityRegistry();
    registry.register(new ObjectDetectCapability(MODEL_PATH));
    // Nem registra ClutterDetectCapability — se o gate falhar e tentar
    // rodar mesmo assim, o teste quebra com "Capability não encontrada"
    // (prova real de que o gate impede a chamada, não só filtra o resultado).
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());
    let idSequence = 0;
    const useCase = new DetectObjectsUseCase(pie, objectRepository, () => `o${++idSequence}`);

    const objects = await useCase.execute({
      projectId: "p3",
      filePath: videoPath,
      frameWidth: size.width,
      frameHeight: size.height,
      scenes: [scene],
    });

    expect(objects).toHaveLength(0);
  }, 20_000);
});
