import { join } from "node:path";
import { DomainError, type ObjectRepository, type ProjectRepository, type SceneRepository } from "@digify/domain";
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
import type {
  QualitySharpenOutput,
} from "../infrastructure/capabilities/QualitySharpenCapability.js";
import type {
  HomeStagingActInput,
  HomeStagingActOutput,
  TemporaryObjectBox,
} from "../infrastructure/capabilities/HomeStagingActCapability.js";
import type {
  PerspectiveAnalyzeInput,
  PerspectiveAnalyzeOutput,
} from "../infrastructure/capabilities/PerspectiveAnalyzeCapability.js";
import type {
  PerspectiveActInput,
  PerspectiveActOutput,
} from "../infrastructure/capabilities/PerspectiveActCapability.js";
import type {
  ReflectionAnalyzeInput,
  ReflectionAnalyzeOutput,
} from "../infrastructure/capabilities/ReflectionAnalyzeCapability.js";
import type {
  ReflectionActInput,
  ReflectionActOutput,
} from "../infrastructure/capabilities/ReflectionActCapability.js";
import type { ImageOverlay, RenderingEngine } from "../infrastructure/render/RenderingEngine.js";
import { detectCameraMotion } from "../infrastructure/vision/detectCameraMotion.js";

export interface RenderPreviewInput {
  projectId: string;
  colorProfile: ColorProfile;
  /** Aplicar realce de nitidez (`quality.sharpen`)? Padrão: não. */
  applySharpen?: boolean;
  /** Aplicar tentativa de remoção de itens temporários (`home_staging.act`)? Padrão: não. */
  applyHomeStaging?: boolean;
  /** Aplicar correção de horizonte (`perspective.analyze`+`perspective.act`)? Padrão: não. */
  applyPerspective?: boolean;
  /** Aplicar redução de reflexo/brilho difuso (`reflection.analyze`+`reflection.act`)? Padrão: não. */
  applyReflection?: boolean;
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
    private readonly sceneRepository: SceneRepository,
    private readonly objectRepository: ObjectRepository,
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

    const appliedCorrections = [lightingAct.output.description, colorAct.output.description];
    const overlays: ImageOverlay[] = [];

    if (input.applySharpen) {
      const sharpen = await this.pie.run<void, QualitySharpenOutput>(
        "quality.sharpen",
        undefined,
        { projectId: input.projectId },
      );
      filters.push(sharpen.output.ffmpegFilter);
      appliedCorrections.push(sharpen.output.description);
    }

    if (input.applyReflection) {
      const { width: frameWidth, height: frameHeight } = project.toProps().video;
      const scenes = await this.sceneRepository.findByProject(input.projectId);

      // Roda ANTES de home_staging: o overlay de reflexo cobre o frame
      // inteiro, então precisa compor primeiro pra não sobrescrever um
      // patch local de home_staging na mesma cena (Rendering Engine compõe
      // overlays na ordem em que entram no array).
      for (const scene of scenes) {
        const sceneProps = scene.toProps();
        const atMs = Math.round((sceneProps.startMs + sceneProps.endMs) / 2);

        const { isStatic: sceneIsStatic } = await detectCameraMotion(
          sourcePath,
          sceneProps.startMs,
          sceneProps.endMs,
          frameWidth,
          frameHeight,
        );

        const reflectionAnalyze = await this.pie.run<
          ReflectionAnalyzeInput,
          ReflectionAnalyzeOutput
        >(
          "reflection.analyze",
          { filePath: sourcePath, atMs, frameWidth, frameHeight },
          { projectId: input.projectId },
        );

        const reflectionAct = await this.pie.run<ReflectionActInput, ReflectionActOutput>(
          "reflection.act",
          {
            ...reflectionAnalyze.output,
            filePath: sourcePath,
            atMs,
            frameWidth,
            frameHeight,
            sceneStartMs: sceneProps.startMs,
            sceneEndMs: sceneProps.endMs,
            sceneIsStatic,
          },
          { projectId: input.projectId },
        );

        if (reflectionAct.output.overlay) {
          overlays.push(reflectionAct.output.overlay);
        }
        appliedCorrections.push(reflectionAct.output.description);
      }
    }

    if (input.applyHomeStaging) {
      const { width: frameWidth, height: frameHeight } = project.toProps().video;
      const scenes = await this.sceneRepository.findByProject(input.projectId);

      for (const scene of scenes) {
        const sceneProps = scene.toProps();
        const objects = await this.objectRepository.findByScene(sceneProps.id);
        const temporaryObjects: TemporaryObjectBox[] = objects
          .filter((object) => object.toProps().removable)
          .map((object) => object.toProps().boundingBox);

        if (temporaryObjects.length === 0) continue;

        const { isStatic: sceneIsStatic } = await detectCameraMotion(
          sourcePath,
          sceneProps.startMs,
          sceneProps.endMs,
          frameWidth,
          frameHeight,
        );

        const staging = await this.pie.run<HomeStagingActInput, HomeStagingActOutput>(
          "home_staging.act",
          {
            filePath: sourcePath,
            atMs: Math.round((sceneProps.startMs + sceneProps.endMs) / 2),
            frameWidth,
            frameHeight,
            sceneStartMs: sceneProps.startMs,
            sceneEndMs: sceneProps.endMs,
            temporaryObjects,
            sceneIsStatic,
          },
          { projectId: input.projectId },
        );

        if (staging.output.overlay) {
          overlays.push(staging.output.overlay);
        } else {
          filters.push(...staging.output.legacyFilters);
        }
        appliedCorrections.push(staging.output.description);
      }
    }

    if (input.applyPerspective) {
      const videoProps = project.toProps().video;
      const midpointMs = Math.round(videoProps.durationMs / 2);

      const perspectiveAnalyze = await this.pie.run<
        PerspectiveAnalyzeInput,
        PerspectiveAnalyzeOutput
      >(
        "perspective.analyze",
        {
          filePath: sourcePath,
          atMs: midpointMs,
          frameWidth: videoProps.width,
          frameHeight: videoProps.height,
        },
        { projectId: input.projectId },
      );

      const perspectiveAct = await this.pie.run<PerspectiveActInput, PerspectiveActOutput>(
        "perspective.act",
        {
          ...perspectiveAnalyze.output,
          frameWidth: videoProps.width,
          frameHeight: videoProps.height,
        },
        { projectId: input.projectId },
      );

      if (perspectiveAct.output.ffmpegFilter) {
        filters.push(perspectiveAct.output.ffmpegFilter);
      }
      appliedCorrections.push(perspectiveAct.output.description);
    }

    const outputPath = join(this.rendersDir, `${input.projectId}.mp4`);
    const { outputPath: renderedPath } = await this.renderingEngine.render({
      sourcePath,
      outputPath,
      filters,
      overlays,
    });

    return {
      outputPath: renderedPath,
      appliedCorrections,
    };
  }
}
