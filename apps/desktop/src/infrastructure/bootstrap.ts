import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  openDatabase,
  SqliteObjectRepository,
  SqliteProjectRepository,
  SqliteRenderRepository,
  SqliteSceneRepository,
} from "@digify/database";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { ImportVideoUseCase } from "../application/ImportVideoUseCase.js";
import { DetectScenesUseCase } from "../application/DetectScenesUseCase.js";
import { RecognizeRoomsUseCase } from "../application/RecognizeRoomsUseCase.js";
import { DetectObjectsUseCase } from "../application/DetectObjectsUseCase.js";
import { PropertyScoreUseCase } from "../application/PropertyScoreUseCase.js";
import { ImportAndAnalyzeVideoUseCase } from "../application/ImportAndAnalyzeVideoUseCase.js";
import { ListProjectsUseCase } from "../application/ListProjectsUseCase.js";
import { RenderPreviewUseCase } from "../application/RenderPreviewUseCase.js";
import { CreateSlideshowUseCase } from "../application/CreateSlideshowUseCase.js";
import { ExportVideoUseCase } from "../application/ExportVideoUseCase.js";
import { IntakeCapability } from "./capabilities/IntakeCapability.js";
import { SceneDetectCapability } from "./capabilities/SceneDetectCapability.js";
import { RoomRecognizeCapability } from "./capabilities/RoomRecognizeCapability.js";
import { ObjectDetectCapability } from "./capabilities/ObjectDetectCapability.js";
import { ClutterDetectCapability } from "./capabilities/ClutterDetectCapability.js";
import { PropertyScoreCapability } from "./capabilities/PropertyScoreCapability.js";
import { LightingAnalyzeCapability } from "./capabilities/LightingAnalyzeCapability.js";
import { LightingActCapability } from "./capabilities/LightingActCapability.js";
import { ColorActCapability } from "./capabilities/ColorActCapability.js";
import { QualitySharpenCapability } from "./capabilities/QualitySharpenCapability.js";
import { HomeStagingActCapability } from "./capabilities/HomeStagingActCapability.js";
import { PerspectiveAnalyzeCapability } from "./capabilities/PerspectiveAnalyzeCapability.js";
import { PerspectiveActCapability } from "./capabilities/PerspectiveActCapability.js";
import { ReflectionAnalyzeCapability } from "./capabilities/ReflectionAnalyzeCapability.js";
import { ReflectionActCapability } from "./capabilities/ReflectionActCapability.js";
import { RenderingEngine } from "./render/RenderingEngine.js";
import { DiskRenderedFileCleaner } from "./render/DiskRenderedFileCleaner.js";
import { FrameByFrameCleaner } from "./render/FrameByFrameCleaner.js";
import { SlideshowRenderer } from "./render/SlideshowRenderer.js";
import { DiskUserSettings } from "./settings/DiskUserSettings.js";
import { OpenverseMusicLibrary } from "./music/OpenverseMusicLibrary.js";
import { ElectronWebPageCapturer } from "./web/ElectronWebPageCapturer.js";

/**
 * Composition root — o único lugar que instancia infraestrutura concreta e a
 * injeta nos casos de uso (docs/ENGINEERING_STANDARDS.md, "Dependency Injection").
 */
export function bootstrap(userDataDir: string, modelsDir: string) {
  const db = openDatabase(join(userDataDir, "digify.sqlite"));
  const projectRepository = new SqliteProjectRepository(db);
  const sceneRepository = new SqliteSceneRepository(db);
  const objectRepository = new SqliteObjectRepository(db);
  const renderRepository = new SqliteRenderRepository(db);

  const registry = new CapabilityRegistry();
  registry.register(new IntakeCapability());
  registry.register(new SceneDetectCapability());
  registry.register(
    new RoomRecognizeCapability(
      join(modelsDir, "mobilenetv2-12.onnx"),
      join(modelsDir, "room_classifier_head.onnx"),
    ),
  );
  registry.register(new ObjectDetectCapability(join(modelsDir, "yolox_nano.onnx")));
  registry.register(new ClutterDetectCapability());
  registry.register(new PropertyScoreCapability());
  registry.register(new LightingAnalyzeCapability());
  registry.register(new LightingActCapability());
  registry.register(new ColorActCapability());
  registry.register(new QualitySharpenCapability());

  const rendersDir = join(userDataDir, "renders");
  mkdirSync(rendersDir, { recursive: true });

  // Vídeos montados a partir de fotos/PDF. Efêmero igual ao resto:
  // `clearSessionData` leva esta pasta embora ao sair.
  const slideshowDir = join(userDataDir, "slideshow");
  mkdirSync(slideshowDir, { recursive: true });

  // lama_inpainting.onnx (~196MB) não é versionado no git (acima do limite
  // de 100MB do GitHub) — ver tools/inpainting/README.md. Quando ausente,
  // HomeStagingActCapability cai automaticamente no fallback delogo.
  const inpaintingPatchesDir = join(userDataDir, "inpainting-patches");
  mkdirSync(inpaintingPatchesDir, { recursive: true });
  registry.register(
    new HomeStagingActCapability(join(modelsDir, "lama_inpainting.onnx"), inpaintingPatchesDir),
  );

  registry.register(new PerspectiveAnalyzeCapability());
  registry.register(new PerspectiveActCapability());

  const reflectionPatchesDir = join(userDataDir, "reflection-patches");
  mkdirSync(reflectionPatchesDir, { recursive: true });
  registry.register(new ReflectionAnalyzeCapability());
  registry.register(new ReflectionActCapability(reflectionPatchesDir));

  const bus = new EventBus();
  const pie = new PropertyIntelligenceEngine(registry, bus);

  const importVideo = new ImportVideoUseCase(pie, projectRepository);
  const detectScenes = new DetectScenesUseCase(pie, sceneRepository);
  const recognizeRooms = new RecognizeRoomsUseCase(pie, sceneRepository);
  const detectObjects = new DetectObjectsUseCase(pie, objectRepository);
  const computePropertyScore = new PropertyScoreUseCase(pie, sceneRepository, objectRepository);

  return {
    db,
    bus,
    importAndAnalyzeVideo: new ImportAndAnalyzeVideoUseCase(
      importVideo,
      detectScenes,
      recognizeRooms,
      detectObjects,
      computePropertyScore,
      projectRepository,
      new DiskRenderedFileCleaner(rendersDir),
    ),
    listProjects: new ListProjectsUseCase(projectRepository),
    computePropertyScore,
    renderPreview: new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      rendersDir,
      sceneRepository,
      objectRepository,
      renderRepository,
      // Precisa dos DOIS modelos: o YOLOX decide o que pode ser apagado e o
      // LaMa reconstrói o buraco. Faltando qualquer um, `isAvailable()` devolve
      // false e o render cai no caminho antigo em vez de falhar.
      new FrameByFrameCleaner(
        join(modelsDir, "lama_inpainting.onnx"),
        join(modelsDir, "yolox_nano.onnx"),
      ),
    ),
    // Criação de vídeo a partir de fotos/PDF. Fica junto dos renders porque o
    // resultado é efêmero igual: `clearSessionData` leva os dois embora.
    createSlideshow: new CreateSlideshowUseCase(
      new SlideshowRenderer(),
      slideshowDir,
      new ElectronWebPageCapturer(),
    ),
    slideshowDir,
    // FORA de `sessionData.ts`: projetos e vídeos somem a cada abertura
    // (ferramenta de passagem), mas logo e pasta de trilhas são configuração
    // de quem usa — reapontar o próprio logo toda vez seria atrito puro.
    userSettings: new DiskUserSettings(join(userDataDir, "preferencias.json")),
    // Busca de trilha livre. É o ÚNICO ponto do app que sai pra internet por
    // conta própria; tudo o mais roda offline, e a busca só acontece quando o
    // usuário digita e aperta buscar.
    musicLibrary: new OpenverseMusicLibrary(),
    exportVideo: new ExportVideoUseCase(projectRepository),
    sceneRepository,
    objectRepository,
    projectRepository,
    renderRepository,
  };
}

export type Bootstrap = ReturnType<typeof bootstrap>;
