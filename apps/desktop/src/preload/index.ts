import { contextBridge, ipcRenderer } from "electron";
import type { ProjectDTO } from "../main/ipc.js";

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
};

contextBridge.exposeInMainWorld("digify", digifyApi);

export type DigifyApi = typeof digifyApi;
