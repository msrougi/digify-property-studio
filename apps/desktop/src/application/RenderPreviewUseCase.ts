import { join } from "node:path";
import { DomainError, type ProjectRepository } from "@digify/domain";
import type { PropertyIntelligenceEngine } from "@digify/pie";
import type {
  LightingAnalyzeInput,
  LightingAnalyzeOutput,
} from "../infrastructure/capabilities/LightingAnalyzeCapability.js";
import type {
  LightingActInput,
  LightingActOutput,
} from "../infrastructure/capabilities/LightingActCapability.js";
import type {
  ColorActInput,
  ColorActOutput,
  ColorProfile,
} from "../infrastructure/capabilities/ColorActCapability.js";
import type { RenderingEngine } from "../infrastructure/render/RenderingEngine.js";

export interface RenderPreviewInput {
  projectId: string;
  colorProfile: ColorProfile;
}

export interface RenderPreviewResult {
  outputPath: string;
  appliedCorrections: string[];
}

/**
 * Caso de uso "Aplicar melhorias" — compõe as decisões do PIE™ (lighting +
 * color) e delega a execução ao Rendering Engine. "A IA decide. O Rendering
 * Engine executa." (docs/reference/original-docs/11 - Rendering Engine.md).
 */
export class RenderPreviewUseCase {
  constructor(
    private readonly pie: PropertyIntelligenceEngine,
    private readonly projectRepository: ProjectRepository,
    private readonly renderingEngine: RenderingEngine,
    private readonly rendersDir: string,
  ) {}

  async execute(input: RenderPreviewInput): Promise<RenderPreviewResult> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new DomainError(`Projeto não encontrado: ${input.projectId}`, "PROJECT_NOT_FOUND");
    }

    const sourcePath = project.toProps().sourceVideoPath;

    const analyze = await this.pie.run<LightingAnalyzeInput, LightingAnalyzeOutput>(
      "lighting.analyze",
      { filePath: sourcePath },
      { projectId: input.projectId },
    );

    const lightingAct = await this.pie.run<LightingActInput, LightingActOutput>(
      "lighting.act",
      analyze.output,
      { projectId: input.projectId },
    );

    const colorAct = await this.pie.run<ColorActInput, ColorActOutput>(
      "color.act",
      { profile: input.colorProfile },
      { projectId: input.projectId },
    );

    const filters = [lightingAct.output.ffmpegFilter, colorAct.output.ffmpegFilter].filter(
      (filter): filter is string => filter !== null,
    );

    const outputPath = join(this.rendersDir, `${input.projectId}.mp4`);
    const { outputPath: renderedPath } = await this.renderingEngine.render({
      sourcePath,
      outputPath,
      filters,
    });

    return {
      outputPath: renderedPath,
      appliedCorrections: [lightingAct.output.description, colorAct.output.description],
    };
  }
}
