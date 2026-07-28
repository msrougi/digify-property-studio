import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase, SqliteProjectRepository } from "@digify/database";
import { Project } from "@digify/domain";
import { generateTestVideo } from "../../test-support/generateTestVideo.js";
import { readVideoMetadata } from "../../infrastructure/ffmpeg/ffprobeMetadata.js";
import { ExportVideoUseCase } from "../ExportVideoUseCase.js";

describe("ExportVideoUseCase", () => {
  let db: Database.Database;
  let dir: string;

  beforeEach(() => {
    db = openDatabase(":memory:");
    dir = mkdtempSync(join(tmpdir(), "digify-export-"));
  });

  afterEach(() => {
    db.close();
  });

  it("copia de verdade o vídeo renderizado para o destino escolhido e marca o projeto como exportado", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    await projectRepository.save(
      Project.create({
        id: "p1",
        name: "Apartamento",
        sourceVideoPath: join(dir, "origem.mp4"),
        sourceVideoHash: "hash-fixture",
        video: { durationMs: 1000, width: 64, height: 64, fps: 10, codecName: "h264", hasAudio: false },
      }),
    );

    const renderedVideoPath = join(dir, "renderizado.mp4");
    const fakeMp4Bytes = Buffer.from("conteudo-real-de-teste-nao-e-mock-de-video");
    writeFileSync(renderedVideoPath, fakeMp4Bytes);

    const destinationPath = join(dir, "meu-video-final.mp4");
    const useCase = new ExportVideoUseCase(projectRepository);

    const result = await useCase.execute({
      projectId: "p1",
      renderedVideoPath,
      destinationPath,
    });

    expect(result.destinationPath).toBe(destinationPath);
    expect(result.project.toProps().status).toBe("exported");

    // Não é só checar que "não deu erro" — confere que os bytes no destino são
    // idênticos ao arquivo renderizado (cópia real, não simulação).
    const copiedBytes = readFileSync(destinationPath);
    expect(copiedBytes.equals(fakeMp4Bytes)).toBe(true);

    const persisted = await projectRepository.findById("p1");
    expect(persisted?.toProps().status).toBe("exported");
  });

  it("com um preset, gera de verdade a variante redimensionada em vez de copiar o arquivo", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    await projectRepository.save(
      Project.create({
        id: "p1",
        name: "Apartamento",
        sourceVideoPath: join(dir, "origem.mp4"),
        sourceVideoHash: "hash-fixture",
        video: { durationMs: 1000, width: 64, height: 64, fps: 10, codecName: "h264", hasAudio: false },
      }),
    );

    const renderedVideoPath = join(dir, "renderizado.mp4");
    await generateTestVideo(renderedVideoPath, [{ color: "blue", durationSec: 1 }], {
      size: "640x360",
    });

    const destinationPath = join(dir, "reels.mp4");
    const useCase = new ExportVideoUseCase(projectRepository);

    const result = await useCase.execute({
      projectId: "p1",
      renderedVideoPath,
      destinationPath,
      presetId: "instagram_reels",
    });

    expect(result.destinationPath).toBe(destinationPath);
    const meta = await readVideoMetadata(destinationPath);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it("lança erro de domínio quando o projeto não existe", async () => {
    const projectRepository = new SqliteProjectRepository(db);
    const useCase = new ExportVideoUseCase(projectRepository);

    await expect(
      useCase.execute({
        projectId: "inexistente",
        renderedVideoPath: join(dir, "renderizado.mp4"),
        destinationPath: join(dir, "saida.mp4"),
      }),
    ).rejects.toThrow(/não encontrado/);
  });
});
