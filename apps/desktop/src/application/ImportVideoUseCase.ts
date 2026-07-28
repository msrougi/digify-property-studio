import { randomUUID } from "node:crypto";
import { Project, type ProjectRepository } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type { IntakeInput, IntakeOutput } from "../infrastructure/capabilities/IntakeCapability.js";

export interface ImportVideoInput {
  filePath: string;
  projectName?: string;
}

export interface ImportVideoResult {
  project: Project;
  intake: IntakeOutput;
}

/**
 * Caso de uso "Importar vídeo" — coordena o fluxo, nunca decide IA
 * (docs/00-ARCHITECTURE.md, seção 5, "Application Layer").
 */
export class ImportVideoUseCase {
  constructor(
    private readonly pie: PropertyIntelligenceEngine,
    private readonly projectRepository: ProjectRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async execute(input: ImportVideoInput): Promise<ImportVideoResult> {
    const projectId = this.generateId();

    const intakeResult = await this.pie.run<IntakeInput, IntakeOutput>(
      "intake",
      { filePath: input.filePath },
      { projectId },
    );
    const intake = intakeResult.output;

    const project = Project.create({
      id: projectId,
      name: input.projectName ?? intake.fileName,
      sourceVideoPath: input.filePath,
      sourceVideoHash: intake.sourceVideoHash,
      video: {
        durationMs: intake.durationMs,
        width: intake.width,
        height: intake.height,
        fps: intake.fps,
        codecName: intake.codecName,
        hasAudio: intake.hasAudio,
      },
    });

    await this.projectRepository.save(project);
    return { project, intake };
  }
}
