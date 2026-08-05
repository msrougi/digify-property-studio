import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  openDatabase,
  SqliteObjectRepository,
  SqliteProjectRepository,
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

/**
 * Composition root — o único lugar que instancia infraestrutura concreta e a
 * injeta nos casos de uso (docs/ENGINEERING_STANDARDS.md, "Dependency Injection").
 */
export function bootstrap(userDataDir: string, modelsDir: string) {
  const db = openDatabase(join(userDataDir, "digify.sqlite"));
  const projectRepository = new SqliteProjectRepository(db);
  const sceneRepository = new SqliteSceneRepository(db);
  const objectRepository = new SqliteObjectRepository(db);

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
    ),
    exportVideo: new ExportVideoUseCase(projectRepository),
    sceneRepository,
    objectRepository,
    projectRepository,
  };
}

export type Bootstrap = ReturnType<typeof bootstrap>;
