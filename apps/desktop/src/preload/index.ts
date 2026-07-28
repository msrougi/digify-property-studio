import { contextBridge, ipcRenderer } from "electron";
import type {
  ProjectDTO,
  SceneDTO,
  DetectedObjectDTO,
  PropertyScoreDTO,
  RenderPreviewOptions,
  RenderPreviewDTO,
  ExportVideoDTO,
  ExportPresetDTO,
} from "../main/ipc.js";
import { toMediaUrl } from "../shared/media.js";

/**
 * Única superfície exposta ao renderer — nunca expõe Node/fs diretamente
 * (contextIsolation obrigatório, docs/reference/original-docs/18 - Security
 * Architecture.md).
 */
const digifyApi = {
  selectVideoFile: (): Promise<string | null> => ipcRenderer.invoke("projects:selectVideoFile"),
  importVideo: (filePath: string): Promise<ProjectDTO> =>
    ipcRenderer.invoke("projects:import", filePath),
  listProjects: (): Promise<ProjectDTO[]> => ipcRenderer.invoke("projects:list"),
  getScenes: (projectId: string): Promise<SceneDTO[]> =>
    ipcRenderer.invoke("projects:getScenes", projectId),
  getObjects: (projectId: string): Promise<DetectedObjectDTO[]> =>
    ipcRenderer.invoke("projects:getObjects", projectId),
  getPropertyScore: (projectId: string): Promise<PropertyScoreDTO> =>
    ipcRenderer.invoke("projects:getPropertyScore", projectId),
  renderPreview: (options: RenderPreviewOptions): Promise<RenderPreviewDTO> =>
    ipcRenderer.invoke("projects:renderPreview", options),
  selectExportDestination: (suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke("projects:selectExportDestination", suggestedName),
  exportVideo: (
    projectId: string,
    renderedVideoPath: string,
    destinationPath: string,
    presetId?: string,
  ): Promise<ExportVideoDTO> =>
    ipcRenderer.invoke(
      "projects:exportVideo",
      projectId,
      renderedVideoPath,
      destinationPath,
      presetId,
    ),
  getExportPresets: (): Promise<ExportPresetDTO[]> =>
    ipcRenderer.invoke("projects:getExportPresets"),
  toMediaUrl,
};

contextBridge.exposeInMainWorld("digify", digifyApi);

export type DigifyApi = typeof digifyApi;
