import type { Project, ProjectRepository, Scene } from "@digify/domain";
import type { DetectScenesUseCase } from "./DetectScenesUseCase.js";
import type { RecognizeRoomsUseCase } from "./RecognizeRoomsUseCase.js";
import type { ImportVideoInput, ImportVideoUseCase } from "./ImportVideoUseCase.js";

export interface ImportAndAnalyzeResult {
  project: Project;
  scenes: Scene[];
}

/**
 * Compõe Import + Análise automática — "Análise automática inicia imediatamente"
 * (docs/reference/original-docs/06 - User Journeys.md, Jornada 1). O usuário nunca
 * precisa disparar a análise manualmente. Stage 3 do pipeline (Property
 * Understanding): Scene Detection -> Room Recognition
 * (docs/reference/original-docs/09 - Video Processing Pipeline.md).
 */
export class ImportAndAnalyzeVideoUseCase {
  constructor(
    private readonly importVideo: ImportVideoUseCase,
    private readonly detectScenes: DetectScenesUseCase,
    private readonly recognizeRooms: RecognizeRoomsUseCase,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(input: ImportVideoInput): Promise<ImportAndAnalyzeResult> {
    const { project, intake } = await this.importVideo.execute(input);

    project.transitionTo("analyzing");
    await this.projectRepository.save(project);

    const detectedScenes = await this.detectScenes.execute({
      projectId: project.id,
      filePath: input.filePath,
      durationMs: intake.durationMs,
    });

    const scenes = await this.recognizeRooms.execute({
      projectId: project.id,
      filePath: input.filePath,
      scenes: detectedScenes,
    });

    project.transitionTo("ready_for_review");
    await this.projectRepository.save(project);

    return { project, scenes };
  }
}
