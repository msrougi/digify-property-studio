import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase, SqliteProjectRepository } from "@digify/database";
import { CapabilityRegistry, EventBus, PropertyIntelligenceEngine } from "@digify/pie";
import { IntakeCapability } from "../../infrastructure/capabilities/IntakeCapability.js";
import { ImportVideoUseCase } from "../ImportVideoUseCase.js";
import { ListProjectsUseCase } from "../ListProjectsUseCase.js";

describe("ImportVideoUseCase", () => {
  let db: Database.Database;
  let videoPath: string;

  beforeEach(() => {
    db = openDatabase(":memory:");
    const dir = mkdtempSync(join(tmpdir(), "digify-import-"));
    videoPath = join(dir, "apartamento-vila-mariana.mp4");
    writeFileSync(videoPath, "conteudo-de-video-fake-para-teste");
  });

  afterEach(() => {
    db.close();
  });

  function buildUseCase() {
    const projectRepository = new SqliteProjectRepository(db);
    const registry = new CapabilityRegistry();
    registry.register(new IntakeCapability());
    const pie = new PropertyIntelligenceEngine(registry, new EventBus());
    return {
      importVideo: new ImportVideoUseCase(pie, projectRepository, () => "fixed-project-id"),
      listProjects: new ListProjectsUseCase(projectRepository),
    };
  }

  it("importa um vídeo e persiste o projeto com status 'importing'", async () => {
    const { importVideo, listProjects } = buildUseCase();

    const project = await importVideo.execute({ filePath: videoPath });

    expect(project.status).toBe("importing");
    expect(project.toProps().sourceVideoHash).toHaveLength(64); // sha256 hex

    const projects = await listProjects.execute();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).toBe("fixed-project-id");
  });

  it("usa o nome do arquivo como nome do projeto quando não informado", async () => {
    const { importVideo } = buildUseCase();

    const project = await importVideo.execute({ filePath: videoPath });

    expect(project.toProps().name).toBe("apartamento-vila-mariana.mp4");
  });

  it("respeita o nome de projeto informado explicitamente", async () => {
    const { importVideo } = buildUseCase();

    const project = await importVideo.execute({
      filePath: videoPath,
      projectName: "Cobertura Duplex Itaim",
    });

    expect(project.toProps().name).toBe("Cobertura Duplex Itaim");
  });

  it("nunca persiste bytes de vídeo — apenas caminho e hash", async () => {
    const { importVideo } = buildUseCase();

    const project = await importVideo.execute({ filePath: videoPath });
    const props = project.toProps();

    expect(props.sourceVideoPath).toBe(videoPath);
    expect(Object.keys(props)).not.toContain("videoBytes");
  });
});
