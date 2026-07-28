import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, SqliteProjectRepository, SqliteSceneRepository } from "@digify/database";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { ImportVideoUseCase } from "../application/ImportVideoUseCase.js";
import { DetectScenesUseCase } from "../application/DetectScenesUseCase.js";
import { ImportAndAnalyzeVideoUseCase } from "../application/ImportAndAnalyzeVideoUseCase.js";
import { ListProjectsUseCase } from "../application/ListProjectsUseCase.js";
import { RenderPreviewUseCase } from "../application/RenderPreviewUseCase.js";
import { IntakeCapability } from "./capabilities/IntakeCapability.js";
import { SceneDetectCapability } from "./capabilities/SceneDetectCapability.js";
import { LightingAnalyzeCapability } from "./capabilities/LightingAnalyzeCapability.js";
import { LightingActCapability } from "./capabilities/LightingActCapability.js";
import { ColorActCapability } from "./capabilities/ColorActCapability.js";
import { RenderingEngine } from "./render/RenderingEngine.js";

/**
 * Composition root — o único lugar que instancia infraestrutura concreta e a
 * injeta nos casos de uso (docs/ENGINEERING_STANDARDS.md, "Dependency Injection").
 */
export function bootstrap(userDataDir: string) {
  const db = openDatabase(join(userDataDir, "digify.sqlite"));
  const projectRepository = new SqliteProjectRepository(db);
  const sceneRepository = new SqliteSceneRepository(db);

  const registry = new CapabilityRegistry();
  registry.register(new IntakeCapability());
  registry.register(new SceneDetectCapability());
  registry.register(new LightingAnalyzeCapability());
  registry.register(new LightingActCapability());
  registry.register(new ColorActCapability());

  const bus = new EventBus();
  const pie = new PropertyIntelligenceEngine(registry, bus);

  const importVideo = new ImportVideoUseCase(pie, projectRepository);
  const detectScenes = new DetectScenesUseCase(pie, sceneRepository);

  const rendersDir = join(userDataDir, "renders");
  mkdirSync(rendersDir, { recursive: true });

  return {
    db,
    bus,
    importAndAnalyzeVideo: new ImportAndAnalyzeVideoUseCase(
      importVideo,
      detectScenes,
      projectRepository,
    ),
    listProjects: new ListProjectsUseCase(projectRepository),
    renderPreview: new RenderPreviewUseCase(
      pie,
      projectRepository,
      new RenderingEngine(),
      rendersDir,
    ),
    sceneRepository,
  };
}

export type Bootstrap = ReturnType<typeof bootstrap>;
