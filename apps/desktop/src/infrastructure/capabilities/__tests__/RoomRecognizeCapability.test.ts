import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoomRecognizeCapability } from "../RoomRecognizeCapability.js";

/**
 * Fixtures em __fixtures__ são vídeos reais de 1s gerados a partir de fotos
 * reais do dataset emanhamed/Houses-dataset (tools/room-classifier/data/) —
 * nunca imagens sintéticas. Cada uma foi conferida em Python antes de virar
 * fixture, para garantir que representa uma classificação correta conhecida
 * (tools/room-classifier/models/metrics.json: 96,3% de acurácia no holdout).
 */
const FIXTURES_DIR = join(__dirname, "..", "__fixtures__");
const MODELS_DIR = join(__dirname, "..", "..", "..", "..", "models");

function buildCapability(): RoomRecognizeCapability {
  return new RoomRecognizeCapability(
    join(MODELS_DIR, "mobilenetv2-12.onnx"),
    join(MODELS_DIR, "room_classifier_head.onnx"),
  );
}

describe("RoomRecognizeCapability", () => {
  it.each([
    ["bedroom-sample.mp4", "bedroom"],
    ["bathroom-sample.mp4", "bathroom"],
    ["kitchen-sample.mp4", "kitchen"],
  ] as const)(
    "reconhece %s como %s usando o modelo treinado real (MobileNetV2 + classificador)",
    async (fixture, expectedRoomType) => {
      const capability = buildCapability();
      const result = await capability.execute({
        filePath: join(FIXTURES_DIR, fixture),
        atMs: 200,
      });

      expect(result.output.roomType).toBe(expectedRoomType);
      expect(result.confidence.value).toBeGreaterThan(50);
    },
    30_000,
  );

  it("as probabilidades das três classes somam ~1 (softmax real)", async () => {
    const capability = buildCapability();
    const result = await capability.execute({
      filePath: join(FIXTURES_DIR, "bedroom-sample.mp4"),
      atMs: 200,
    });

    const sum = Object.values(result.output.probabilities).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.01);
  });
});
