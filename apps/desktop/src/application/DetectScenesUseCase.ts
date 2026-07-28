import { randomUUID } from "node:crypto";
import { Scene, type SceneRepository } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type {
  SceneDetectInput,
  SceneDetectOutput,
} from "../infrastructure/capabilities/SceneDetectCapability.js";

export interface DetectScenesInput {
  projectId: string;
  filePath: string;
  durationMs: number;
}

/**
 * Caso de uso "Detectar cenas" — Stage 3 (Property Understanding) do pipeline
 * (docs/reference/original-docs/09 - Video Processing Pipeline.md).
 */
export class DetectScenesUseCase {
  constructor(
    private readonly pie: PropertyIntelligenceEngine,
    private readonly sceneRepository: SceneRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async execute(input: DetectScenesInput): Promise<Scene[]> {
    const result = await this.pie.run<SceneDetectInput, SceneDetectOutput>(
      "scene.detect",
      { filePath: input.filePath, durationMs: input.durationMs },
      { projectId: input.projectId },
    );

    const scenes = result.output.scenes.map((boundary) =>
      Scene.create({
        id: this.generateId(),
        projectId: input.projectId,
        startMs: boundary.startMs,
        endMs: boundary.endMs,
      }),
    );

    await this.sceneRepository.saveMany(scenes);
    return scenes;
  }
}
