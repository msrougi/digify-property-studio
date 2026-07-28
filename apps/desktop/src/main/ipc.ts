import { dialog, ipcMain, type BrowserWindow } from "electron";
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

export interface RenderPreviewDTO {
  outputPath: string;
  appliedCorrections: string[];
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
    "projects:renderPreview",
    async (_event, projectId: string, colorProfile: ColorProfile): Promise<RenderPreviewDTO> => {
      return app.renderPreview.execute({ projectId, colorProfile });
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
