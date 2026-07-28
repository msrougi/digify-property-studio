import type { Scene, SceneRepository } from "@digify/domain";
import { Confidence } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type {
  RoomRecognizeInput,
  RoomRecognizeOutput,
} from "../infrastructure/capabilities/RoomRecognizeCapability.js";

export interface RecognizeRoomsInput {
  projectId: string;
  filePath: string;
  scenes: Scene[];
}

/**
 * Caso de uso "Reconhecer ambientes" — Stage 3 (Property Understanding) do
 * pipeline (docs/reference/original-docs/09 - Video Processing Pipeline.md).
 * Roda a capability `room.recognize` no frame do meio de cada cena já
 * detectada e persiste o resultado via `Scene.assignRoom`.
 */
export class RecognizeRoomsUseCase {
  constructor(
    private readonly pie: PropertyIntelligenceEngine,
    private readonly sceneRepository: SceneRepository,
  ) {}

  async execute(input: RecognizeRoomsInput): Promise<Scene[]> {
    for (const scene of input.scenes) {
      const props = scene.toProps();
      const midpointMs = Math.round((props.startMs + props.endMs) / 2);

      const result = await this.pie.run<RoomRecognizeInput, RoomRecognizeOutput>(
        "room.recognize",
        { filePath: input.filePath, atMs: midpointMs },
        { projectId: input.projectId },
      );

      scene.assignRoom(result.output.roomType, Confidence.of(result.confidence.value));
    }

    await this.sceneRepository.saveMany(input.scenes);
    return input.scenes;
  }
}
