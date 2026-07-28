import { describe, expect, it } from "vitest";
import { PerspectiveActCapability } from "../PerspectiveActCapability.js";

describe("PerspectiveActCapability", () => {
  it("não corrige quando o horizonte já está nivelado (abaixo do limiar)", async () => {
    const result = await new PerspectiveActCapability().execute({
      tiltDegrees: 0.5,
      peakStrength: 0.4,
      edgePointCount: 500,
      frameWidth: 1280,
      frameHeight: 720,
    });

    expect(result.output.ffmpegFilter).toBeNull();
    expect(result.output.needsCorrection).toBe(false);
  });

  it("não corrige quando o sinal de detecção não é confiável", async () => {
    const result = await new PerspectiveActCapability().execute({
      tiltDegrees: 12,
      peakStrength: 0.02,
      edgePointCount: 500,
      frameWidth: 1280,
      frameHeight: 720,
    });

    expect(result.output.ffmpegFilter).toBeNull();
    expect(result.output.needsCorrection).toBe(false);
  });

  it("gera um filtro real de rotação + recorte + escala para uma inclinação confiável", async () => {
    const result = await new PerspectiveActCapability().execute({
      tiltDegrees: 5,
      peakStrength: 0.3,
      edgePointCount: 500,
      frameWidth: 1280,
      frameHeight: 720,
    });

    expect(result.output.needsCorrection).toBe(true);
    expect(result.output.ffmpegFilter).toMatch(
      /^rotate=-0\.087266:fillcolor=black,crop=\d+:\d+:\d+:\d+,scale=1280:720$/,
    );
  });

  it("clampa correções extremas em 8° em vez de confiar cegamente na detecção", async () => {
    const result = await new PerspectiveActCapability().execute({
      tiltDegrees: 40,
      peakStrength: 0.5,
      edgePointCount: 500,
      frameWidth: 1280,
      frameHeight: 720,
    });

    expect(result.output.description).toContain("8.0°");
  });

  it("nunca reporta confidence alto o bastante pra auto-executar (correção geométrica invasiva, exige confirmação)", async () => {
    const result = await new PerspectiveActCapability().execute({
      tiltDegrees: 5,
      peakStrength: 0.3,
      edgePointCount: 500,
      frameWidth: 1280,
      frameHeight: 720,
    });

    expect(result.confidence.decision).toBe("confirm");
    expect(result.confidence.shouldExecuteAutomatically).toBe(false);
  });
});
