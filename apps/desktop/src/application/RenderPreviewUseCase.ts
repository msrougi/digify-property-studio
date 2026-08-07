import { join } from "node:path";
import {
  DomainError,
  Render,
  type ObjectRepository,
  type ProjectRepository,
  type RenderRepository,
  type SceneRepository,
} from "@digify/domain";
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
import type { ClutterCleaner } from "./ClutterCleaner.js";
import type { OnStageProgress } from "./progress.js";

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
    private readonly renderRepository: RenderRepository,
    /**
     * Limpeza de bagunça quadro a quadro. Opcional: sem ela (ou sem o modelo
     * de inpainting montado) o caso de uso cai no caminho antigo, por cena.
     */
    private readonly clutterCleaner?: ClutterCleaner,
  ) {}

  /**
   * O caminho quadro a quadro só entra quando há modelo. É ele que de fato
   * limpa vídeo de câmera em movimento — que é o caso de todo vídeo de
   * imóvel real (alguém andando pela casa).
   */
  private useFrameByFrameCleaning(applyHomeStaging: boolean | undefined): boolean {
    return applyHomeStaging === true && this.clutterCleaner?.isAvailable() === true;
  }

  async execute(
    input: RenderPreviewInput,
    onProgress?: OnStageProgress,
  ): Promise<RenderPreviewResult> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new DomainError(`Projeto não encontrado: ${input.projectId}`, "PROJECT_NOT_FOUND");
    }

    // Lista de etapas dinâmica: só entram as correções de fato pedidas nesta
    // chamada — reportar uma etapa que nem vai rodar seria enganoso.
    const frameByFrame = this.useFrameByFrameCleaning(input.applyHomeStaging);
    const stages = ["Analisando iluminação e cor"];
    // Nome próprio porque a experiência é outra: esta etapa reconstrói cada
    // quadro com IA e leva minutos, não segundos. Chamá-la do mesmo jeito que
    // a versão rápida faria o usuário achar que o app travou.
    if (frameByFrame) stages.push("Removendo objetos soltos com IA (quadro a quadro)");
    if (input.applySharpen) stages.push("Aplicando nitidez");
    if (input.applyReflection) stages.push("Reduzindo reflexo");
    if (input.applyHomeStaging && !frameByFrame) stages.push("Removendo itens temporários");
    if (input.applyPerspective) stages.push("Corrigindo perspectiva");
    stages.push("Renderizando vídeo final");
    const totalStages = stages.length;
    let currentStageIndex = 0;
    const emit = (percent: number): void => {
      onProgress?.({
        stage: stages[currentStageIndex] as string,
        stageIndex: currentStageIndex + 1,
        totalStages,
        percent,
      });
    };
    const nextStage = (): void => {
      currentStageIndex++;
      emit(0);
    };

    emit(0);
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
    emit(100);

    // Fonte de tudo que vem depois. A limpeza quadro a quadro gera um vídeo
    // intermediário, e ela roda ANTES das demais etapas de propósito: o
    // overlay de reflexo é um recorte do frame original cobrindo o quadro
    // inteiro — colado sobre o vídeo já limpo, ele traria a bagunça de volta.
    let renderSourcePath = sourcePath;

    if (frameByFrame) {
      nextStage();
      const cleanedPath = join(this.rendersDir, `${input.projectId}-limpo.mp4`);
      const cleaner = this.clutterCleaner as ClutterCleaner;
      const { framesProcessed, framesChanged } = await cleaner.clean(
        sourcePath,
        cleanedPath,
        (progress) => {
          // Sem FPS legível não há total confiável, e uma % inventada numa
          // etapa de minutos seria pior que nenhuma.
          if (progress.totalFrames > 0) {
            emit(
              Math.min(100, Math.round((progress.framesProcessed / progress.totalFrames) * 100)),
            );
          }
        },
      );
      renderSourcePath = cleanedPath;
      appliedCorrections.push(
        framesChanged > 0
          ? `Objetos soltos removidos com IA em ${framesChanged} de ${framesProcessed} quadros (reconstrução quadro a quadro, acompanha a câmera em movimento).`
          : "Nenhum objeto solto encontrado — móveis, eletrodomésticos e acabamentos nunca são removidos, então o vídeo foi mantido como está.",
      );
      emit(100);
    }

    if (input.applySharpen) {
      nextStage();
      const sharpen = await this.pie.run<void, QualitySharpenOutput>(
        "quality.sharpen",
        undefined,
        { projectId: input.projectId },
      );
      filters.push(sharpen.output.ffmpegFilter);
      appliedCorrections.push(sharpen.output.description);
      emit(100);
    }

    if (input.applyReflection) {
      nextStage();
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
          renderSourcePath,
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
          { filePath: renderSourcePath, atMs, frameWidth, frameHeight },
          { projectId: input.projectId },
        );

        const reflectionAct = await this.pie.run<ReflectionActInput, ReflectionActOutput>(
          "reflection.act",
          {
            ...reflectionAnalyze.output,
            filePath: renderSourcePath,
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
      emit(100);
    }

    if (input.applyHomeStaging && !frameByFrame) {
      nextStage();
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
      emit(100);
    }

    if (input.applyPerspective) {
      nextStage();
      const videoProps = project.toProps().video;
      const midpointMs = Math.round(videoProps.durationMs / 2);

      const perspectiveAnalyze = await this.pie.run<
        PerspectiveAnalyzeInput,
        PerspectiveAnalyzeOutput
      >(
        "perspective.analyze",
        {
          filePath: renderSourcePath,
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
      emit(100);
    }

    nextStage();

    const outputPath = join(this.rendersDir, `${input.projectId}.mp4`);
    let renderedPath: string;
    try {
      ({ outputPath: renderedPath } = await this.renderingEngine.render(
        { sourcePath: renderSourcePath, outputPath, filters, overlays },
        // % real do FFmpeg (tempo de vídeo já processado / duração total) —
        // a única etapa com sub-progresso granular de verdade; as demais só
        // reportam 0/100 ao começar/terminar (ver `emit`/`nextStage` acima).
        (progress) => emit(progress.percent),
      ));
    } finally {
      // O intermediário já cumpriu o papel — em `finally` porque um render que
      // falha não pode deixar um vídeo inteiro esquecido no disco.
      if (renderSourcePath !== sourcePath) {
        await this.clutterCleaner?.discard(renderSourcePath);
      }
    }

    // Persiste pra que a comparação antes/depois sobreviva a trocar de
    // projeto e a fechar o app — antes o resultado só vivia no estado da
    // tela e se perdia, mesmo com o arquivo ainda no disco.
    await this.renderRepository.save(
      Render.create({ projectId: input.projectId, outputPath: renderedPath, appliedCorrections }),
    );

    return {
      outputPath: renderedPath,
      appliedCorrections,
    };
  }
}
