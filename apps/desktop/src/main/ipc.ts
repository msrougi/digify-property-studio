import { copyFileSync, existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { DomainError, type ObjectCategory } from "@digify/domain";
import type { Bootstrap } from "../infrastructure/bootstrap.js";
import type { ColorProfile } from "../infrastructure/capabilities/ColorActCapability.js";
import { EXPORT_PRESETS, type ExportPresetId } from "../infrastructure/export/exportPresets.js";
import { SLIDESHOW_FORMATS } from "../application/CreateSlideshowUseCase.js";
import type { MusicTrack, UserSettings } from "../application/UserSettings.js";
import type { MusicSearchResult } from "../application/MusicLibrary.js";
import { listMusicTracks } from "../infrastructure/settings/DiskUserSettings.js";
import type { StageProgress } from "../application/progress.js";

export interface ProgressEvent extends StageProgress {
  operationId: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  status: string;
  sourceVideoPath: string;
  durationMs: number;
  createdAt: string;
}

export interface SceneDTO {
  id: string;
  startMs: number;
  endMs: number;
  roomType: string | null;
}

export interface DetectedObjectDTO {
  id: string;
  sceneId: string;
  category: ObjectCategory;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  removable: boolean;
}

export interface PropertyScoreDTO {
  score: number;
  lightingScore: number;
  organizationScore: number;
  suggestions: string[];
}

export interface RenderPreviewOptions {
  projectId: string;
  colorProfile: ColorProfile;
  applySharpen?: boolean;
  applyHomeStaging?: boolean;
  applyPerspective?: boolean;
  applyReflection?: boolean;
}

export interface RenderPreviewDTO {
  outputPath: string;
  appliedCorrections: string[];
}

export interface RenderDTO {
  outputPath: string;
  appliedCorrections: string[];
  createdAt: string;
}

export interface ExportVideoDTO {
  destinationPath: string;
  status: string;
}

export interface SlideshowFormatDTO {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface CreateSlideshowOptions {
  /** Caminhos de foto/PDF e endereços de site, misturados na ordem do vídeo. */
  sources: string[];
  format?: "feed" | "story" | "square";
  slideDurationSec?: number;
  usePdfTextAsCaption?: boolean;
  audioPath?: string;
  maxWebSlices?: number;
  logoPath?: string;
  logoMode?: "intro" | "watermark" | "both";
}

export interface SlideshowDTO {
  outputPath: string;
  durationSec: number;
  slideCount: number;
  pdfPageCount: number;
  webSliceCount: number;
  /** Texto de crédito gravado ao lado do vídeo, quando a licença da trilha exige. */
  creditsPath?: string;
  creditsText?: string;
}

export interface ExportPresetDTO {
  id: string;
  label: string;
  network: string;
  width: number;
  height: number;
  description: string;
}

/**
 * Loga o erro real no terminal (stdout do processo main, sempre visível
 * rodando o app empacotado direto por linha de comando) antes de deixar a
 * exception seguir pro renderer via rejeição do `invoke` — sem isso, um
 * erro real só aparecia no DevTools do renderer (que ninguém abre rodando
 * o app empacotado de verdade), fazendo qualquer falha real parecer
 * silenciosa/impossível de diagnosticar. Bug real: um usuário reportou
 * "Não conseguimos aplicar as melhorias" sem nenhum jeito de ver por quê.
 */
function logIpcError(channel: string, error: unknown): void {
  console.error(`[ipc:${channel}] falhou:`, error instanceof Error ? error.stack ?? error.message : error);
}

/** `ipcMain.handle` com log automático de qualquer exception — ver `logIpcError`. */
function handle<Args extends unknown[], R>(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Promise<R> | R,
): void {
  ipcMain.handle(channel, async (event, ...args: Args) => {
    try {
      return await fn(event, ...args);
    } catch (error) {
      logIpcError(channel, error);
      throw error;
    }
  });
}

/**
 * Toda comunicação renderer -> main passa por aqui, nunca acesso direto a
 * Node/filesystem a partir do renderer (docs/reference/original-docs/18 -
 * Security Architecture.md, "Least Privilege").
 */
export function registerIpcHandlers(app: Bootstrap, window: BrowserWindow): void {
  handle("projects:selectVideoFile", async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Vídeos", extensions: ["mp4", "mov", "hevc"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle(
    "projects:import",
    async (_event, filePath: string, operationId: string): Promise<ProjectDTO> => {
      const { project } = await app.importAndAnalyzeVideo.execute({ filePath }, (progress) => {
        window.webContents.send("progress:import", { operationId, ...progress } satisfies ProgressEvent);
      });
      return toProjectDto(project);
    },
  );

  handle("projects:list", async (): Promise<ProjectDTO[]> => {
    const projects = await app.listProjects.execute();
    return projects.map(toProjectDto);
  });

  handle("projects:getScenes", async (_event, projectId: string): Promise<SceneDTO[]> => {
    const scenes = await app.sceneRepository.findByProject(projectId);
    return scenes.map(toSceneDto);
  });

  handle(
    "projects:getObjects",
    async (_event, projectId: string): Promise<DetectedObjectDTO[]> => {
      const scenes = await app.sceneRepository.findByProject(projectId);
      const objects: DetectedObjectDTO[] = [];
      for (const scene of scenes) {
        const sceneObjects = await app.objectRepository.findByScene(scene.toProps().id);
        objects.push(...sceneObjects.map(toObjectDto));
      }
      return objects;
    },
  );

  handle(
    "projects:getPropertyScore",
    async (_event, projectId: string): Promise<PropertyScoreDTO> => {
      const project = await app.projectRepository.findById(projectId);
      if (!project) {
        throw new DomainError(`Projeto não encontrado: ${projectId}`, "PROJECT_NOT_FOUND");
      }
      return app.computePropertyScore.execute({
        projectId,
        filePath: project.toProps().sourceVideoPath,
      });
    },
  );

  handle(
    "projects:renderPreview",
    async (
      _event,
      options: RenderPreviewOptions,
      operationId: string,
    ): Promise<RenderPreviewDTO> => {
      return app.renderPreview.execute(options, (progress) => {
        window.webContents.send("progress:render", { operationId, ...progress } satisfies ProgressEvent);
      });
    },
  );

  // Render já feito antes (persistido) — é o que permite fechar o app ou
  // trocar de projeto e reencontrar a comparação antes/depois onde parou.
  handle("projects:getRender", async (_event, projectId: string): Promise<RenderDTO | null> => {
    const render = await app.renderRepository.findByProject(projectId);
    if (!render) return null;

    const props = render.toProps();
    // O arquivo pode ter sido apagado por fora do app — não adianta mostrar
    // uma comparação apontando pra um vídeo que não existe mais.
    if (!existsSync(props.outputPath)) return null;

    return {
      outputPath: props.outputPath,
      appliedCorrections: props.appliedCorrections,
      createdAt: props.createdAt.toISOString(),
    };
  });

  handle(
    "projects:selectExportDestination",
    async (_event, suggestedName: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog(window, {
        defaultPath: suggestedName,
        filters: [{ name: "Vídeo MP4", extensions: ["mp4"] }],
      });
      return result.canceled ? null : (result.filePath ?? null);
    },
  );

  handle(
    "projects:exportVideo",
    async (
      _event,
      projectId: string,
      renderedVideoPath: string,
      destinationPath: string,
      presetId?: ExportPresetId,
    ): Promise<ExportVideoDTO> => {
      const { project, destinationPath: savedPath } = await app.exportVideo.execute({
        projectId,
        renderedVideoPath,
        destinationPath,
        ...(presetId ? { presetId } : {}),
      });
      return { destinationPath: savedPath, status: project.toProps().status };
    },
  );

  handle("slideshow:selectFiles", async (): Promise<string[]> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Fotos e PDF", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "pdf"] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  /**
   * Endereço FIXO, nunca vindo do renderer: `openExternal` com URL arbitrária
   * seria um vetor pra abrir qualquer coisa na máquina do usuário.
   *
   * Sem ID de canal na URL de propósito. A biblioteca vive em
   * `studio.youtube.com/channel/<ID>/music`, e o ID é de cada usuário — a
   * versão anterior deste código tinha `.../channel/UC/music` chumbado, um
   * ID inventado que não abriria nada (ID de canal real tem 24 caracteres).
   * Sem o segmento, o Studio resolve pro canal de quem está logado.
   *
   * Não deu pra confirmar o redirecionamento daqui (o ambiente de
   * desenvolvimento não tem saída pra internet), então a tela também mostra o
   * endereço em texto: se ele cair no lugar errado, o usuário ainda chega lá
   * pelo navegador.
   */
  const YOUTUBE_AUDIO_LIBRARY = "https://studio.youtube.com/music";

  handle("settings:get", (): UserSettings => app.userSettings.read());

  handle("settings:save", (_event, settings: UserSettings): UserSettings => {
    app.userSettings.write(settings);
    // Devolve o que foi de fato gravado: a leitura descarta caminho que não
    // existe mais, então a tela precisa ver o resultado real, não o pedido.
    return app.userSettings.read();
  });

  handle("slideshow:selectMusicFolder", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
      title: "Pasta com suas trilhas",
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle("slideshow:listMusic", (_event, folder: string): MusicTrack[] =>
    listMusicTracks(folder),
  );

  handle("slideshow:openAudioLibrary", async (): Promise<void> => {
    await shell.openExternal(YOUTUBE_AUDIO_LIBRARY);
  });

  handle(
    "music:search",
    (_event, text: string): Promise<MusicSearchResult[]> =>
      app.musicLibrary.search({ text }),
  );

  /**
   * Baixa a faixa PRA PASTA DE TRILHAS do usuário — o destino vem das
   * preferências, nunca do renderer. Aceitar um caminho da tela daria à
   * interface o poder de escrever em qualquer lugar do disco.
   */
  handle("music:download", async (_event, track: MusicSearchResult): Promise<MusicTrack> => {
    const folder = app.userSettings.read().musicFolder;
    if (!folder) {
      throw new DomainError("Escolha primeiro a pasta onde suas trilhas ficam.", "NO_MUSIC_FOLDER");
    }
    const path = await app.musicLibrary.download(track, folder);
    // Mesmo formato de `listMusicTracks`: nome sem extensão, pra faixa recém
    // baixada e faixa que já estava na pasta aparecerem iguais na lista.
    return { name: basename(path, extname(path)), path };
  });

  handle("slideshow:selectLogo", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      // PNG primeiro: é o formato que carrega transparência, e logo com fundo
      // branco num vídeo escuro fica com uma caixa em volta.
      filters: [{ name: "Logo", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle("slideshow:selectAudio", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Áudio", extensions: ["mp3", "m4a", "aac", "wav", "ogg"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle("slideshow:getFormats", (): SlideshowFormatDTO[] =>
    Object.entries(SLIDESHOW_FORMATS).map(([id, format]) => ({
      id,
      label: format.label,
      width: format.width,
      height: format.height,
    })),
  );

  handle(
    "slideshow:create",
    async (
      _event,
      options: CreateSlideshowOptions,
      operationId: string,
    ): Promise<SlideshowDTO> => {
      // Nome com timestamp: montar um vídeo novo não pode sobrescrever o que
      // o usuário ainda não salvou.
      const outputPath = join(app.slideshowDir, `anuncio-${Date.now()}.mp4`);
      const result = await app.createSlideshow.execute(
        { ...options, outputPath },
        (progress) => {
          window.webContents.send("progress:slideshow", {
            operationId,
            ...progress,
          } satisfies ProgressEvent);
        },
      );
      return result;
    },
  );

  handle(
    "slideshow:save",
    async (_event, sourcePath: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog(window, {
        defaultPath: "anuncio.mp4",
        filters: [{ name: "Vídeo", extensions: ["mp4"] }],
      });
      if (result.canceled || !result.filePath) return null;
      copyFileSync(sourcePath, result.filePath);
      return result.filePath;
    },
  );

  handle("projects:getExportPresets", (): ExportPresetDTO[] => {
    return Object.values(EXPORT_PRESETS).map((preset) => ({
      id: preset.id,
      label: preset.label,
      network: preset.network,
      width: preset.width,
      height: preset.height,
      description: preset.description,
    }));
  });
}

function toProjectDto(project: {
  toProps(): {
    id: string;
    name: string;
    status: string;
    sourceVideoPath: string;
    video: { durationMs: number };
    createdAt: Date;
  };
}): ProjectDTO {
  const props = project.toProps();
  return {
    id: props.id,
    name: props.name,
    status: props.status,
    sourceVideoPath: props.sourceVideoPath,
    durationMs: props.video.durationMs,
    createdAt: props.createdAt.toISOString(),
  };
}

function toSceneDto(scene: {
  toProps(): { id: string; startMs: number; endMs: number; roomType: string | null };
}): SceneDTO {
  const props = scene.toProps();
  return { id: props.id, startMs: props.startMs, endMs: props.endMs, roomType: props.roomType };
}

function toObjectDto(object: {
  toProps(): {
    id: string;
    sceneId: string;
    category: ObjectCategory;
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
    removable: boolean;
  };
}): DetectedObjectDTO {
  const props = object.toProps();
  return {
    id: props.id,
    sceneId: props.sceneId,
    category: props.category,
    boundingBox: props.boundingBox,
    confidence: props.confidence,
    removable: props.removable,
  };
}
