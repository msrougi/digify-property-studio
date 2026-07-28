import { dialog, ipcMain, type BrowserWindow } from "electron";
import type { Bootstrap } from "../infrastructure/bootstrap.js";

export interface ProjectDTO {
  id: string;
  name: string;
  status: string;
  sourceVideoPath: string;
  createdAt: string;
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
    const project = await app.importVideo.execute({ filePath });
    return toDto(project);
  });

  ipcMain.handle("projects:list", async (): Promise<ProjectDTO[]> => {
    const projects = await app.listProjects.execute();
    return projects.map(toDto);
  });
}

function toDto(project: { toProps(): { id: string; name: string; status: string; sourceVideoPath: string; createdAt: Date } }): ProjectDTO {
  const props = project.toProps();
  return {
    id: props.id,
    name: props.name,
    status: props.status,
    sourceVideoPath: props.sourceVideoPath,
    createdAt: props.createdAt.toISOString(),
  };
}
