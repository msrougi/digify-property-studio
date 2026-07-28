import { describe, expect, it } from "vitest";
import { PerspectiveActCapability } from "../PerspectiveActCapability.js";

const BASE = {
  edgePointCount: 500,
  frameWidth: 1280,
  frameHeight: 720,
};

describe("PerspectiveActCapability", () => {
  it("não corrige quando horizonte e verticais já estão corretos (abaixo do limiar)", async () => {
    const result = await new PerspectiveActCapability().execute({
      ...BASE,
      tiltDegrees: 0.5,
      peakStrength: 0.4,
      verticalTiltDegrees: 0.5,
      verticalPeakStrength: 0.4,
    });

    expect(result.output.ffmpegFilter).toBeNull();
    expect(result.output.needsCorrection).toBe(false);
  });

  it("não corrige quando nenhum sinal de detecção é confiável", async () => {
    const result = await new PerspectiveActCapability().execute({
      ...BASE,
      tiltDegrees: 12,
      peakStrength: 0.02,
      verticalTiltDegrees: 10,
      verticalPeakStrength: 0.02,
    });

    expect(result.output.ffmpegFilter).toBeNull();
    expect(result.output.needsCorrection).toBe(false);
  });

  it("gera um filtro real de rotação + recorte + escala para uma inclinação de horizonte confiável", async () => {
    const result = await new PerspectiveActCapability().execute({
      ...BASE,
      tiltDegrees: 5,
      peakStrength: 0.3,
      verticalTiltDegrees: 0,
      verticalPeakStrength: 0,
    });

    expect(result.output.needsCorrection).toBe(true);
    expect(result.output.ffmpegFilter).toMatch(
      /^rotate=-0\.087266:fillcolor=black,crop=\d+:\d+:\d+:\d+,scale=1280:720$/,
    );
  });

  it("gera um filtro real de cisalhamento (perspective) + recorte + escala para linhas verticais confiáveis", async () => {
    const result = await new PerspectiveActCapability().execute({
      ...BASE,
      tiltDegrees: 0,
      peakStrength: 0,
      verticalTiltDegrees: 5,
      verticalPeakStrength: 0.3,
    });

    expect(result.output.needsCorrection).toBe(true);
    expect(result.output.ffmpegFilter).toMatch(
      /^perspective=x0=-?\d+:y0=0:x1=-?\d+:y1=0:x2=0:y2=720:x3=1280:y3=720,crop=\d+:720:\d+:0,scale=1280:720$/,
    );
    expect(result.output.description).toContain("linhas verticais endireitadas");
  });

  it("combina as duas correções (horizonte + verticais) numa única cadeia quando ambas são confiáveis", async () => {
    const result = await new PerspectiveActCapability().execute({
      ...BASE,
      tiltDegrees: 4,
      peakStrength: 0.3,
      verticalTiltDegrees: 5,
      verticalPeakStrength: 0.3,
    });

    expect(result.output.needsCorrection).toBe(true);
    expect(result.output.ffmpegFilter).toContain("rotate=");
    expect(result.output.ffmpegFilter).toContain("perspective=");
    expect(result.output.description).toContain("horizonte corrigido");
    expect(result.output.description).toContain("linhas verticais endireitadas");
  });

  it("clampa correções extremas em 8° em vez de confiar cegamente na detecção", async () => {
    const result = await new PerspectiveActCapability().execute({
      ...BASE,
      tiltDegrees: 40,
      peakStrength: 0.5,
      verticalTiltDegrees: 0,
      verticalPeakStrength: 0,
    });

    expect(result.output.description).toContain("8.0°");
  });

  it("nunca reporta confidence alto o bastante pra auto-executar (correção geométrica invasiva, exige confirmação)", async () => {
    const result = await new PerspectiveActCapability().execute({
      ...BASE,
      tiltDegrees: 5,
      peakStrength: 0.3,
      verticalTiltDegrees: 0,
      verticalPeakStrength: 0,
    });

    expect(result.confidence.decision).toBe("confirm");
    expect(result.confidence.shouldExecuteAutomatically).toBe(false);
  });
});
