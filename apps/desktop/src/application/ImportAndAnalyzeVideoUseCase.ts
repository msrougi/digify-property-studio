import type { DetectedObject, Project, ProjectRepository, Scene } from "@digify/domain";
import type { DetectScenesUseCase } from "./DetectScenesUseCase.js";
import type { RecognizeRoomsUseCase } from "./RecognizeRoomsUseCase.js";
import type { DetectObjectsUseCase } from "./DetectObjectsUseCase.js";
import type { PropertyScoreUseCase } from "./PropertyScoreUseCase.js";
import type { ImportVideoInput, ImportVideoUseCase } from "./ImportVideoUseCase.js";
import type { PropertyScoreOutput } from "../infrastructure/capabilities/PropertyScoreCapability.js";
import type { OnStageProgress } from "./progress.js";

const STAGES = [
  "Importando vídeo",
  "Detectando cenas",
  "Reconhecendo cômodos",
  "Detectando objetos",
  "Calculando Property Score",
] as const;

export interface ImportAndAnalyzeResult {
  project: Project;
  scenes: Scene[];
  objects: DetectedObject[];
  propertyScore: PropertyScoreOutput;
}

/**
 * Compõe Import + Análise automática — "Análise automática inicia imediatamente"
 * (docs/reference/original-docs/06 - User Journeys.md, Jornada 1). O usuário nunca
 * precisa disparar a análise manualmente. Stage 3 do pipeline (Property
 * Understanding): Scene Detection -> Room Recognition -> Object Detection ->
 * Property Score (docs/reference/original-docs/09 - Video Processing Pipeline.md).
 */
export class ImportAndAnalyzeVideoUseCase {
  constructor(
    private readonly importVideo: ImportVideoUseCase,
    private readonly detectScenes: DetectScenesUseCase,
    private readonly recognizeRooms: RecognizeRoomsUseCase,
    private readonly detectObjects: DetectObjectsUseCase,
    private readonly computePropertyScore: PropertyScoreUseCase,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(
    input: ImportVideoInput,
    onProgress?: OnStageProgress,
  ): Promise<ImportAndAnalyzeResult> {
    const totalStages = STAGES.length;
    const emit = (stageIndex: number, percent: number): void => {
      onProgress?.({ stage: STAGES[stageIndex - 1] as string, stageIndex, totalStages, percent });
    };

    emit(1, 0);
    const { project, intake } = await this.importVideo.execute(input);
    emit(1, 100);

    project.transitionTo("analyzing");
    await this.projectRepository.save(project);

    emit(2, 0);
    const detectedScenes = await this.detectScenes.execute({
      projectId: project.id,
      filePath: input.filePath,
      durationMs: intake.durationMs,
    });
    emit(2, 100);

    emit(3, 0);
    const scenes = await this.recognizeRooms.execute({
      projectId: project.id,
      filePath: input.filePath,
      scenes: detectedScenes,
    });
    emit(3, 100);

    emit(4, 0);
    const objects = await this.detectObjects.execute({
      projectId: project.id,
      filePath: input.filePath,
      frameWidth: intake.width,
      frameHeight: intake.height,
      scenes,
    });
    emit(4, 100);

    emit(5, 0);
    const propertyScore = await this.computePropertyScore.execute({
      projectId: project.id,
      filePath: input.filePath,
    });
    emit(5, 100);

    project.transitionTo("ready_for_review");
    await this.projectRepository.save(project);

    return { project, scenes, objects, propertyScore };
  }
}
