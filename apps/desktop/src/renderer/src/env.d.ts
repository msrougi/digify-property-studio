/// <reference types="vite/client" />

interface ProjectDTO {
  id: string;
  name: string;
  status: string;
  sourceVideoPath: string;
  durationMs: number;
  createdAt: string;
}

interface SceneDTO {
  id: string;
  startMs: number;
  endMs: number;
  roomType: string | null;
}

interface DigifyApi {
  selectVideoFile(): Promise<string | null>;
  importVideo(filePath: string): Promise<ProjectDTO>;
  listProjects(): Promise<ProjectDTO[]>;
  getScenes(projectId: string): Promise<SceneDTO[]>;
}

interface Window {
  digify: DigifyApi;
}
