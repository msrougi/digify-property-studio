import { randomUUID } from "node:crypto";
import { Project, type ProjectRepository } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type { IntakeInput, IntakeOutput } from "../infrastructure/capabilities/IntakeCapability.js";

export interface ImportVideoInput {
  filePath: string;
  projectName?: string;
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

  async execute(input: ImportVideoInput): Promise<Project> {
    const projectId = this.generateId();

    const intakeResult = await this.pie.run<IntakeInput, IntakeOutput>(
      "intake",
      { filePath: input.filePath },
      { projectId },
    );

    const project = Project.create({
      id: projectId,
      name: input.projectName ?? intakeResult.output.fileName,
      sourceVideoPath: input.filePath,
      sourceVideoHash: intakeResult.output.sourceVideoHash,
    });

    await this.projectRepository.save(project);
    return project;
  }
}
