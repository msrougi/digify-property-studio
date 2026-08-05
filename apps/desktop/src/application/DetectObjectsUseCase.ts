import { randomUUID } from "node:crypto";
import { DetectedObject, type ObjectRepository, type Scene } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type {
  ObjectDetectInput,
  ObjectDetectOutput,
} from "../infrastructure/capabilities/ObjectDetectCapability.js";

export interface DetectObjectsInput {
  projectId: string;
  filePath: string;
  frameWidth: number;
  frameHeight: number;
  scenes: Scene[];
}

/**
 * Caso de uso "Detectar objetos" — Stage 3 (Property Understanding) do
 * pipeline, roda `object.detect` no frame do meio de cada cena e persiste via
 * `ObjectRepository` (docs/reference/original-docs/09 - Video Processing
 * Pipeline.md).
 */
export class DetectObjectsUseCase {
  constructor(
    private readonly pie: PropertyIntelligenceEngine,
    private readonly objectRepository: ObjectRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async execute(input: DetectObjectsInput): Promise<DetectedObject[]> {
    const allObjects: DetectedObject[] = [];

    for (const scene of input.scenes) {
      const sceneProps = scene.toProps();

      const result = await this.pie.run<ObjectDetectInput, ObjectDetectOutput>(
        "object.detect",
        {
          filePath: input.filePath,
          sceneStartMs: sceneProps.startMs,
          sceneEndMs: sceneProps.endMs,
          frameWidth: input.frameWidth,
          frameHeight: input.frameHeight,
        },
        { projectId: input.projectId },
      );

      for (const detected of result.output.objects) {
        allObjects.push(
          DetectedObject.create({
            id: this.generateId(),
            sceneId: sceneProps.id,
            category: detected.category,
            boundingBox: detected.boundingBox,
            confidence: detected.confidence,
          }),
        );
      }
    }

    await this.objectRepository.saveMany(allObjects);
    return allObjects;
  }
}
