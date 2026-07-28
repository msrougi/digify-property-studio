import { dialog, ipcMain, type BrowserWindow } from "electron";
import { DomainError, type ObjectCategory } from "@digify/domain";
import type { Bootstrap } from "../infrastructure/bootstrap.js";
import type { ColorProfile } from "../infrastructure/capabilities/ColorActCapability.js";

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
}

export interface RenderPreviewDTO {
  outputPath: string;
  appliedCorrections: string[];
}

export interface ExportVideoDTO {
  destinationPath: string;
  status: string;
}

/**
 * Toda comunicação renderer -> main passa por aqui, nunca acesso direto a
 * Node/filesystem a partir do renderer (docs/reference/original-docs/18 -
 * Security Architecture.md, "Least Privilege").
 */
export function registerIpcHandlers(app: Bootstrap, window: BrowserWindow): void {
  ipcMain.handle("projects:selectVideoFile", async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Vídeos", extensions: ["mp4", "mov", "hevc"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("projects:import", async (_event, filePath: string): Promise<ProjectDTO> => {
    const { project } = await app.importAndAnalyzeVideo.execute({ filePath });
    return toProjectDto(project);
  });

  ipcMain.handle("projects:list", async (): Promise<ProjectDTO[]> => {
    const projects = await app.listProjects.execute();
    return projects.map(toProjectDto);
  });

  ipcMain.handle("projects:getScenes", async (_event, projectId: string): Promise<SceneDTO[]> => {
    const scenes = await app.sceneRepository.findByProject(projectId);
    return scenes.map(toSceneDto);
  });

  ipcMain.handle(
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

  ipcMain.handle(
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

  ipcMain.handle(
    "projects:renderPreview",
    async (_event, options: RenderPreviewOptions): Promise<RenderPreviewDTO> => {
      return app.renderPreview.execute(options);
    },
  );

  ipcMain.handle(
    "projects:selectExportDestination",
    async (_event, suggestedName: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog(window, {
        defaultPath: suggestedName,
        filters: [{ name: "Vídeo MP4", extensions: ["mp4"] }],
      });
      return result.canceled ? null : (result.filePath ?? null);
    },
  );

  ipcMain.handle(
    "projects:exportVideo",
    async (
      _event,
      projectId: string,
      renderedVideoPath: string,
      destinationPath: string,
    ): Promise<ExportVideoDTO> => {
      const { project, destinationPath: savedPath } = await app.exportVideo.execute({
        projectId,
        renderedVideoPath,
        destinationPath,
      });
      return { destinationPath: savedPath, status: project.toProps().status };
    },
  );
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
