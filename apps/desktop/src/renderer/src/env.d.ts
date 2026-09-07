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

type ColorProfile =
  | "warm"
  | "minimal"
  | "luxury"
  | "modern"
  | "industrial"
  | "beach"
  | "scandinavian"
  | "corporate";

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
  applyPerspective?: boolean;
  applyReflection?: boolean;
}

interface RenderPreviewDTO {
  outputPath: string;
  appliedCorrections: string[];
}

interface ExportVideoDTO {
  destinationPath: string;
  status: string;
}

interface MusicTrackDTO {
  path: string;
  name: string;
}

interface MusicSearchResultDTO {
  id: string;
  title: string;
  creator: string;
  /** `cc0` não exige crédito; `by` exige. A tela mostra isso ANTES de baixar. */
  license: "cc0" | "by";
  sourceUrl: string;
  downloadUrl: string;
  durationSec?: number;
}

interface UserSettingsDTO {
  logoPath?: string;
  logoMode?: "intro" | "watermark" | "both";
  musicFolder?: string;
}

interface SlideshowFormatDTO {
  id: string;
  label: string;
  width: number;
  height: number;
}

interface CreateSlideshowOptions {
  sources: string[];
  format?: "feed" | "story" | "square";
  slideDurationSec?: number;
  usePdfTextAsCaption?: boolean;
  audioPath?: string;
  maxWebSlices?: number;
  logoPath?: string;
  logoMode?: "intro" | "watermark" | "both";
}

interface SlideshowDTO {
  outputPath: string;
  durationSec: number;
  slideCount: number;
  pdfPageCount: number;
  webSliceCount: number;
  creditsPath?: string;
  creditsText?: string;
}

interface ExportPresetDTO {
  id: string;
  label: string;
  network: string;
  width: number;
  height: number;
  description: string;
}

interface RenderDTO {
  outputPath: string;
  appliedCorrections: string[];
  createdAt: string;
}

interface StageProgressDTO {
  stage: string;
  stageIndex: number;
  totalStages: number;
  percent: number;
}

interface DigifyApi {
  selectVideoFile(): Promise<string | null>;
  importVideo(filePath: string, onProgress?: (progress: StageProgressDTO) => void): Promise<ProjectDTO>;
  listProjects(): Promise<ProjectDTO[]>;
  getScenes(projectId: string): Promise<SceneDTO[]>;
  getObjects(projectId: string): Promise<DetectedObjectDTO[]>;
  getPropertyScore(projectId: string): Promise<PropertyScoreDTO>;
  renderPreview(
    options: RenderPreviewOptions,
    onProgress?: (progress: StageProgressDTO) => void,
  ): Promise<RenderPreviewDTO>;
  getRender(projectId: string): Promise<RenderDTO | null>;
  selectExportDestination(suggestedName: string): Promise<string | null>;
  exportVideo(
    projectId: string,
    renderedVideoPath: string,
    destinationPath: string,
    presetId?: string,
  ): Promise<ExportVideoDTO>;
  getExportPresets(): Promise<ExportPresetDTO[]>;
  selectSlideshowFiles(): Promise<string[]>;
  selectSlideshowAudio(): Promise<string | null>;
  selectSlideshowLogo(): Promise<string | null>;
  selectMusicFolder(): Promise<string | null>;
  listMusic(folder: string): Promise<MusicTrackDTO[]>;
  openAudioLibrary(): Promise<void>;
  searchMusic(text: string): Promise<MusicSearchResultDTO[]>;
  downloadMusic(track: MusicSearchResultDTO): Promise<MusicTrackDTO>;
  getSettings(): Promise<UserSettingsDTO>;
  saveSettings(settings: UserSettingsDTO): Promise<UserSettingsDTO>;
  getSlideshowFormats(): Promise<SlideshowFormatDTO[]>;
  createSlideshow(
    options: CreateSlideshowOptions,
    onProgress?: (progress: StageProgressDTO) => void,
  ): Promise<SlideshowDTO>;
  saveSlideshow(sourcePath: string): Promise<string | null>;
  toMediaUrl(absoluteFilePath: string): string;
}

interface Window {
  digify: DigifyApi;
}
