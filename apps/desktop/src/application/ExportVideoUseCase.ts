import { copyFile } from "node:fs/promises";
import { DomainError, type Project, type ProjectRepository } from "@digify/domain";
import { EXPORT_PRESETS, type ExportPresetId } from "../infrastructure/export/exportPresets.js";
import { renderExportPreset } from "../infrastructure/export/renderExportPreset.js";

export interface ExportVideoInput {
  projectId: string;
  /** Caminho do vídeo já renderizado (saída de `RenderPreviewUseCase`). */
  renderedVideoPath: string;
  /** Caminho escolhido pelo usuário (dialog.showSaveDialog no main process). */
  destinationPath: string;
  /** Sem preset, exporta o vídeo já renderizado tal como está (cópia real). Com preset, gera a variante real pro formato/rede escolhido. */
  presetId?: ExportPresetId;
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

    if (input.presetId) {
      const preset = EXPORT_PRESETS[input.presetId];
      if (!preset) {
        throw new DomainError(`Preset de exportação desconhecido: ${input.presetId}`, "UNKNOWN_EXPORT_PRESET");
      }
      await renderExportPreset(input.renderedVideoPath, input.destinationPath, preset);
    } else {
      await copyFile(input.renderedVideoPath, input.destinationPath);
    }

    project.transitionTo("exported");
    await this.projectRepository.save(project);

    return { project, destinationPath: input.destinationPath };
  }
}
