import { contextBridge, ipcRenderer } from "electron";
import type {
  ProjectDTO,
  SceneDTO,
  DetectedObjectDTO,
  PropertyScoreDTO,
  RenderPreviewOptions,
  RenderPreviewDTO,
} from "../main/ipc.js";

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
};

contextBridge.exposeInMainWorld("digify", digifyApi);

export type DigifyApi = typeof digifyApi;
