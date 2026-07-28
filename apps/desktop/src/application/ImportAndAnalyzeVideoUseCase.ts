import type { Project, ProjectRepository, Scene } from "@digify/domain";
import type { DetectScenesUseCase } from "./DetectScenesUseCase.js";
import type { ImportVideoInput, ImportVideoUseCase } from "./ImportVideoUseCase.js";

export interface ImportAndAnalyzeResult {
  project: Project;
  scenes: Scene[];
}

/**
 * Compõe Import + Análise automática — "Análise automática inicia imediatamente"
 * (docs/reference/original-docs/06 - User Journeys.md, Jornada 1). O usuário nunca
 * precisa disparar a análise manualmente.
 */
export class ImportAndAnalyzeVideoUseCase {
  constructor(
    private readonly importVideo: ImportVideoUseCase,
    private readonly detectScenes: DetectScenesUseCase,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(input: ImportVideoInput): Promise<ImportAndAnalyzeResult> {
    const { project, intake } = await this.importVideo.execute(input);

    project.transitionTo("analyzing");
    await this.projectRepository.save(project);

    const scenes = await this.detectScenes.execute({
      projectId: project.id,
      filePath: input.filePath,
      durationMs: intake.durationMs,
    });

    project.transitionTo("ready_for_review");
    await this.projectRepository.save(project);

    return { project, scenes };
  }
}
