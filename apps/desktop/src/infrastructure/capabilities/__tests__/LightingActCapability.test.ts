import { describe, expect, it } from "vitest";
import { LightingActCapability } from "../LightingActCapability.js";

describe("LightingActCapability", () => {
  it("não corrige quando a exposição já está normal", async () => {
    const result = await new LightingActCapability().execute({
      averageLuma: 128,
      classification: "normal",
    });

    expect(result.output.needsCorrection).toBe(false);
    expect(result.output.ffmpegFilter).toBeNull();
  });

  it("aumenta o brilho para vídeo subexposto", async () => {
    const result = await new LightingActCapability().execute({
      averageLuma: 16,
      classification: "underexposed",
    });

    expect(result.output.needsCorrection).toBe(true);
    expect(result.output.ffmpegFilter).toMatch(/^eq=brightness=0\.\d+$/);
  });

  it("reduz o brilho para vídeo superexposto", async () => {
    const result = await new LightingActCapability().execute({
      averageLuma: 235,
      classification: "overexposed",
    });

    expect(result.output.needsCorrection).toBe(true);
    expect(result.output.ffmpegFilter).toMatch(/^eq=brightness=-0\.\d+$/);
  });

  it("nunca decide sozinha — sempre reporta confidence determinístico 100", async () => {
    const result = await new LightingActCapability().execute({
      averageLuma: 16,
      classification: "underexposed",
    });

    expect(result.confidence.value).toBe(100);
  });
});
