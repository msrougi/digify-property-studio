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

type ColorProfile = "warm" | "minimal" | "luxury";

type ObjectCategory = "structural" | "decorative" | "temporary" | "personal" | "luxury";

interface DetectedObjectDTO {
  id: string;
  sceneId: string;
  category: ObjectCategory;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  removable: boolean;
}

interface PropertyScoreDTO {
  score: number;
  lightingScore: number;
  organizationScore: number;
  suggestions: string[];
}

interface RenderPreviewOptions {
  projectId: string;
  colorProfile: ColorProfile;
  applySharpen?: boolean;
  applyHomeStaging?: boolean;
}

interface RenderPreviewDTO {
  outputPath: string;
  appliedCorrections: string[];
}

interface DigifyApi {
  selectVideoFile(): Promise<string | null>;
  importVideo(filePath: string): Promise<ProjectDTO>;
  listProjects(): Promise<ProjectDTO[]>;
  getScenes(projectId: string): Promise<SceneDTO[]>;
  getObjects(projectId: string): Promise<DetectedObjectDTO[]>;
  getPropertyScore(projectId: string): Promise<PropertyScoreDTO>;
  renderPreview(options: RenderPreviewOptions): Promise<RenderPreviewDTO>;
}

interface Window {
  digify: DigifyApi;
}
