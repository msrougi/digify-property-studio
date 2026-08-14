import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  ProjectDTO,
  SceneDTO,
  DetectedObjectDTO,
  PropertyScoreDTO,
  RenderPreviewOptions,
  RenderPreviewDTO,
  ExportVideoDTO,
  ExportPresetDTO,
  ProgressEvent,
  RenderDTO,
  SlideshowFormatDTO,
  CreateSlideshowOptions,
  SlideshowDTO,
} from "../main/ipc.js";
import { toMediaUrl } from "../shared/media.js";

/**
 * Assina um canal de progresso push (`webContents.send`, não
 * request/response), filtrando pelo `operationId` da chamada em curso —
 * evita que um evento de uma chamada anterior/abandonada vaze pra um
 * listener novo. Devolve a função de unsubscribe.
 */
function subscribeToProgress(
  channel: "progress:import" | "progress:render" | "progress:slideshow",
  operationId: string,
  callback: (progress: Omit<ProgressEvent, "operationId">) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, data: ProgressEvent): void => {
    if (data.operationId === operationId) callback(data);
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/**
 * Única superfície exposta ao renderer — nunca expõe Node/fs diretamente
 * (contextIsolation obrigatório, docs/reference/original-docs/18 - Security
 * Architecture.md).
 */
const digifyApi = {
  selectVideoFile: (): Promise<string | null> => ipcRenderer.invoke("projects:selectVideoFile"),
  importVideo: async (
    filePath: string,
    onProgress?: (progress: Omit<ProgressEvent, "operationId">) => void,
  ): Promise<ProjectDTO> => {
    const operationId = crypto.randomUUID();
    const unsubscribe = onProgress
      ? subscribeToProgress("progress:import", operationId, onProgress)
      : null;
    try {
      return await ipcRenderer.invoke("projects:import", filePath, operationId);
    } finally {
      unsubscribe?.();
    }
  },
  listProjects: (): Promise<ProjectDTO[]> => ipcRenderer.invoke("projects:list"),
  getScenes: (projectId: string): Promise<SceneDTO[]> =>
    ipcRenderer.invoke("projects:getScenes", projectId),
  getObjects: (projectId: string): Promise<DetectedObjectDTO[]> =>
    ipcRenderer.invoke("projects:getObjects", projectId),
  getPropertyScore: (projectId: string): Promise<PropertyScoreDTO> =>
    ipcRenderer.invoke("projects:getPropertyScore", projectId),
  renderPreview: async (
    options: RenderPreviewOptions,
    onProgress?: (progress: Omit<ProgressEvent, "operationId">) => void,
  ): Promise<RenderPreviewDTO> => {
    const operationId = crypto.randomUUID();
    const unsubscribe = onProgress
      ? subscribeToProgress("progress:render", operationId, onProgress)
      : null;
    try {
      return await ipcRenderer.invoke("projects:renderPreview", options, operationId);
    } finally {
      unsubscribe?.();
    }
  },
  getRender: (projectId: string): Promise<RenderDTO | null> =>
    ipcRenderer.invoke("projects:getRender", projectId),
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

  // --- Criação de vídeo a partir de fotos e PDF ---
  selectSlideshowFiles: (): Promise<string[]> => ipcRenderer.invoke("slideshow:selectFiles"),
  selectSlideshowAudio: (): Promise<string | null> => ipcRenderer.invoke("slideshow:selectAudio"),
  selectSlideshowLogo: (): Promise<string | null> => ipcRenderer.invoke("slideshow:selectLogo"),
  getSlideshowFormats: (): Promise<SlideshowFormatDTO[]> =>
    ipcRenderer.invoke("slideshow:getFormats"),
  createSlideshow: async (
    options: CreateSlideshowOptions,
    onProgress?: (progress: Omit<ProgressEvent, "operationId">) => void,
  ): Promise<SlideshowDTO> => {
    const operationId = crypto.randomUUID();
    const unsubscribe = onProgress
      ? subscribeToProgress("progress:slideshow", operationId, onProgress)
      : null;
    try {
      return await ipcRenderer.invoke("slideshow:create", options, operationId);
    } finally {
      unsubscribe?.();
    }
  },
  saveSlideshow: (sourcePath: string): Promise<string | null> =>
    ipcRenderer.invoke("slideshow:save", sourcePath),
  toMediaUrl,
};

contextBridge.exposeInMainWorld("digify", digifyApi);

export type DigifyApi = typeof digifyApi;
