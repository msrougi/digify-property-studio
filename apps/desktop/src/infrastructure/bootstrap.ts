import { openDatabase, SqliteProjectRepository, SqliteSceneRepository } from "@digify/database";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { ImportVideoUseCase } from "../application/ImportVideoUseCase.js";
import { DetectScenesUseCase } from "../application/DetectScenesUseCase.js";
import { ImportAndAnalyzeVideoUseCase } from "../application/ImportAndAnalyzeVideoUseCase.js";
import { ListProjectsUseCase } from "../application/ListProjectsUseCase.js";
import { IntakeCapability } from "./capabilities/IntakeCapability.js";
import { SceneDetectCapability } from "./capabilities/SceneDetectCapability.js";

/**
 * Composition root — o único lugar que instancia infraestrutura concreta e a
 * injeta nos casos de uso (docs/ENGINEERING_STANDARDS.md, "Dependency Injection").
 */
export function bootstrap(databasePath: string) {
  const db = openDatabase(databasePath);
  const projectRepository = new SqliteProjectRepository(db);
  const sceneRepository = new SqliteSceneRepository(db);

  const registry = new CapabilityRegistry();
  registry.register(new IntakeCapability());
  registry.register(new SceneDetectCapability());

  const bus = new EventBus();
  const pie = new PropertyIntelligenceEngine(registry, bus);

  const importVideo = new ImportVideoUseCase(pie, projectRepository);
  const detectScenes = new DetectScenesUseCase(pie, sceneRepository);

  return {
    db,
    bus,
    importAndAnalyzeVideo: new ImportAndAnalyzeVideoUseCase(
      importVideo,
      detectScenes,
      projectRepository,
    ),
    listProjects: new ListProjectsUseCase(projectRepository),
    sceneRepository,
  };
}

export type Bootstrap = ReturnType<typeof bootstrap>;
