import { dialog, ipcMain, type BrowserWindow } from "electron";
import { DomainError, type ObjectCategory } from "@digify/domain";
import type { Bootstrap } from "../infrastructure/bootstrap.js";
import type { ColorProfile } from "../infrastructure/capabilities/ColorActCapability.js";
import { EXPORT_PRESETS, type ExportPresetId } from "../infrastructure/export/exportPresets.js";
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

export interface ExportVideoDTO {
  destinationPath: string;
  status: string;
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
