/// <reference types="vite/client" />

interface ProjectDTO {
  id: string;
  name: string;
  status: string;
  sourceVideoPath: string;
  createdAt: string;
}

interface DigifyApi {
  selectVideoFile(): Promise<string | null>;
  importVideo(filePath: string): Promise<ProjectDTO>;
  listProjects(): Promise<ProjectDTO[]>;
}

interface Window {
  digify: DigifyApi;
}
