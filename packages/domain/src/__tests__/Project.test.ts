import { describe, expect, it } from "vitest";
import { Project, type VideoMetadataProps } from "../entities/Project.js";

const SAMPLE_VIDEO: VideoMetadataProps = {
  durationMs: 120_000,
  width: 1920,
  height: 1080,
  fps: 30,
  codecName: "h264",
  hasAudio: true,
};

describe("Project", () => {
  it("nasce com status 'importing'", () => {
    const project = Project.create({
      id: "p1",
      name: "Apartamento Vila Mariana",
      sourceVideoPath: "/videos/vila-mariana.mp4",
      sourceVideoHash: "abc123",
      video: SAMPLE_VIDEO,
    });

    expect(project.status).toBe("importing");
  });

  it("transiciona de status atualizando updatedAt", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const project = Project.create({
      id: "p1",
      name: "Apartamento Vila Mariana",
      sourceVideoPath: "/videos/vila-mariana.mp4",
      sourceVideoHash: "abc123",
      video: SAMPLE_VIDEO,
      now,
    });

    const later = new Date("2026-01-01T00:05:00Z");
    project.transitionTo("analyzing", later);

    expect(project.status).toBe("analyzing");
    expect(project.toProps().updatedAt).toEqual(later);
  });

  it("nunca armazena bytes de vídeo — apenas o caminho no sistema de arquivos", () => {
    const project = Project.create({
      id: "p1",
      name: "Apartamento Vila Mariana",
      sourceVideoPath: "/videos/vila-mariana.mp4",
      sourceVideoHash: "abc123",
      video: SAMPLE_VIDEO,
    });

    const props = project.toProps();
    expect(props.sourceVideoPath).toBe("/videos/vila-mariana.mp4");
    expect(Object.keys(props)).not.toContain("videoBytes");
  });

  it("preserva os metadados reais extraídos pela capability intake", () => {
    const project = Project.create({
      id: "p1",
      name: "Apartamento Vila Mariana",
      sourceVideoPath: "/videos/vila-mariana.mp4",
      sourceVideoHash: "abc123",
      video: SAMPLE_VIDEO,
    });

    expect(project.toProps().video).toEqual(SAMPLE_VIDEO);
  });
});
