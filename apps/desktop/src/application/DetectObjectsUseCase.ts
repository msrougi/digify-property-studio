import { randomUUID } from "node:crypto";
import { DetectedObject, type ObjectRepository, type Scene } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type {
  ObjectDetectInput,
  ObjectDetectOutput,
} from "../infrastructure/capabilities/ObjectDetectCapability.js";
import type {
  ClutterDetectInput,
  ClutterDetectOutput,
} from "../infrastructure/capabilities/ClutterDetectCapability.js";

export interface DetectObjectsInput {
  projectId: string;
  filePath: string;
  frameWidth: number;
  frameHeight: number;
  scenes: Scene[];
}

/**
 * Abaixo disso, o classificador de ambiente (só treinado em banheiro/quarto/
 * cozinha) está pouco confiante na própria escolha — sinal real de que a
 * cena provavelmente não é nenhuma das 3 (ex.: área externa), já que o
 * modelo é forçado a sempre escolher uma das 3 mesmo sem se encaixar bem.
 * Não é um detector de "área externa" de verdade (não existe um hoje) — é a
 * melhor aproximação disponível pra não rodar a heurística de textura (que
 * dispara em falso em grama/plantas/pavimento) lá fora. Ver
 * docs/ml/CLUTTER_DETECTION.md.
 */
const MIN_ROOM_CONFIDENCE_FOR_CLUTTER_DETECTION = 40;

/**
 * Caso de uso "Detectar objetos" — Stage 3 (Property Understanding) do
 * pipeline, roda `object.detect` no frame do meio de cada cena e persiste via
 * `ObjectRepository` (docs/reference/original-docs/09 - Video Processing
 * Pipeline.md). Também roda `clutter.detect` (heurística de textura, ver
 * `ClutterDetectCapability`) pra pegar bagunça genérica que o YOLOX/COCO não
 * tem categoria pra reconhecer — só em cenas indoor reconhecidas com
 * confiança razoável, e sempre excluindo as caixas já achadas por
 * `object.detect` (nunca reprocessa/duplica o que já foi identificado).
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

      const objectResult = await this.pie.run<ObjectDetectInput, ObjectDetectOutput>(
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

      for (const detected of objectResult.output.objects) {
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

      const isConfidentIndoor =
        sceneProps.roomConfidence !== null &&
        sceneProps.roomConfidence >= MIN_ROOM_CONFIDENCE_FOR_CLUTTER_DETECTION;

      if (isConfidentIndoor) {
        const clutterResult = await this.pie.run<ClutterDetectInput, ClutterDetectOutput>(
          "clutter.detect",
          {
            filePath: input.filePath,
            sceneStartMs: sceneProps.startMs,
            sceneEndMs: sceneProps.endMs,
            frameWidth: input.frameWidth,
            frameHeight: input.frameHeight,
            excludeBoxes: objectResult.output.objects.map((o) => o.boundingBox),
          },
          { projectId: input.projectId },
        );

        for (const region of clutterResult.output.regions) {
          allObjects.push(
            DetectedObject.create({
              id: this.generateId(),
              sceneId: sceneProps.id,
              category: "temporary",
              boundingBox: region.boundingBox,
              confidence: region.confidence,
            }),
          );
        }
      }
    }

    await this.objectRepository.saveMany(allObjects);
    return allObjects;
  }
}
