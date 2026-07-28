import type { ObjectRepository, SceneRepository } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type {
  LightingAnalyzeInput,
  LightingAnalyzeOutput,
} from "../infrastructure/capabilities/LightingAnalyzeCapability.js";
import type {
  PropertyScoreInput,
  PropertyScoreOutput,
} from "../infrastructure/capabilities/PropertyScoreCapability.js";

export interface ComputePropertyScoreInput {
  projectId: string;
  filePath: string;
}

/**
 * Caso de uso "Calcular Property Score" — agrega objetos temporários já
 * persistidos (de `DetectObjectsUseCase`) com uma leitura de exposição do
 * vídeo, e delega a nota para a capability `property.score`.
 */
export class PropertyScoreUseCase {
  constructor(
    private readonly pie: PropertyIntelligenceEngine,
    private readonly sceneRepository: SceneRepository,
    private readonly objectRepository: ObjectRepository,
  ) {}

  async execute(input: ComputePropertyScoreInput): Promise<PropertyScoreOutput> {
    const scenes = await this.sceneRepository.findByProject(input.projectId);

    let temporaryObjectsCount = 0;
    for (const scene of scenes) {
      const objects = await this.objectRepository.findByScene(scene.toProps().id);
      temporaryObjectsCount += objects.filter((o) => o.toProps().category === "temporary").length;
    }

    const lighting = await this.pie.run<LightingAnalyzeInput, LightingAnalyzeOutput>(
      "lighting.analyze",
      { filePath: input.filePath },
      { projectId: input.projectId },
    );

    const score = await this.pie.run<PropertyScoreInput, PropertyScoreOutput>(
      "property.score",
      {
        lightingClassifications: [lighting.output.classification],
        temporaryObjectsCount,
      },
      { projectId: input.projectId },
    );

    return score.output;
  }
}
