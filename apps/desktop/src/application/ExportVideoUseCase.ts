import { copyFile } from "node:fs/promises";
import { DomainError, type Project, type ProjectRepository } from "@digify/domain";

export interface ExportVideoInput {
  projectId: string;
  /** Caminho do vídeo já renderizado (saída de `RenderPreviewUseCase`). */
  renderedVideoPath: string;
  /** Caminho escolhido pelo usuário (dialog.showSaveDialog no main process). */
  destinationPath: string;
}

export interface ExportVideoResult {
  project: Project;
  destinationPath: string;
}

/**
 * Caso de uso "Exportar vídeo final" — Export Manager (docs/00-ARCHITECTURE.md,
 * seção 11 / ADR-0001, item E: fica fora da taxonomia de capabilities do PIE™
 * porque não decide nada, só entrega o que o Rendering Engine já produziu).
 * O `RenderingEngine` já grava MP4/H.264 (`RenderingEngine.ts`), então exportar
 * é uma cópia real e verificável para o destino que o usuário escolheu — nunca
 * sobrescreve o vídeo original nem o render interno.
 */
export class ExportVideoUseCase {
  constructor(private readonly projectRepository: ProjectRepository) {}

  async execute(input: ExportVideoInput): Promise<ExportVideoResult> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new DomainError(`Projeto não encontrado: ${input.projectId}`, "PROJECT_NOT_FOUND");
    }

    await copyFile(input.renderedVideoPath, input.destinationPath);

    project.transitionTo("exported");
    await this.projectRepository.save(project);

    return { project, destinationPath: input.destinationPath };
  }
}
