import { openDatabase, SqliteProjectRepository } from "@digify/database";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { ImportVideoUseCase } from "../application/ImportVideoUseCase.js";
import { ListProjectsUseCase } from "../application/ListProjectsUseCase.js";
import { IntakeCapability } from "./capabilities/IntakeCapability.js";

/**
 * Composition root — o único lugar que instancia infraestrutura concreta e a
 * injeta nos casos de uso (docs/ENGINEERING_STANDARDS.md, "Dependency Injection").
 */
export function bootstrap(databasePath: string) {
  const db = openDatabase(databasePath);
  const projectRepository = new SqliteProjectRepository(db);

  const registry = new CapabilityRegistry();
  registry.register(new IntakeCapability());

  const bus = new EventBus();
  const pie = new PropertyIntelligenceEngine(registry, bus);

  return {
    db,
    bus,
    importVideo: new ImportVideoUseCase(pie, projectRepository),
    listProjects: new ListProjectsUseCase(projectRepository),
  };
}

export type Bootstrap = ReturnType<typeof bootstrap>;
