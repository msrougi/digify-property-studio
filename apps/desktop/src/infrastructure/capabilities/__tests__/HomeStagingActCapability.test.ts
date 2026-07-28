import { describe, expect, it } from "vitest";
import { HomeStagingActCapability } from "../HomeStagingActCapability.js";

const BASE_INPUT = {
  filePath: "/nao-usado-no-fallback.mp4",
  atMs: 500,
  frameWidth: 1280,
  frameHeight: 720,
  sceneStartMs: 0,
  sceneEndMs: 2000,
};

describe("HomeStagingActCapability (sem modelo real disponível — caminho fallback delogo)", () => {
  it("não decide nada quando não há objetos temporários", async () => {
    const result = await new HomeStagingActCapability().execute({
      ...BASE_INPUT,
      temporaryObjects: [],
    });

    expect(result.output.legacyFilters).toHaveLength(0);
    expect(result.output.overlay).toBeNull();
    expect(result.output.itemsAddressed).toBe(0);
    expect(result.output.usedRealInpainting).toBe(false);
  });

  it("gera um filtro delogo por objeto temporário, restrito à janela de tempo da cena", async () => {
    const result = await new HomeStagingActCapability().execute({
      ...BASE_INPUT,
      temporaryObjects: [
        { x: 10, y: 20, width: 30, height: 40 },
        { x: 100, y: 50, width: 25, height: 25 },
      ],
    });

    expect(result.output.usedRealInpainting).toBe(false);
    expect(result.output.overlay).toBeNull();
    expect(result.output.legacyFilters).toEqual([
      "delogo=x=10:y=20:w=30:h=40:enable='between(t,0,2)'",
      "delogo=x=100:y=50:w=25:h=25:enable='between(t,0,2)'",
    ]);
    expect(result.output.itemsAddressed).toBe(2);
  });

  it("nunca reporta confidence alto o bastante pra auto-executar (técnica limitada, exige confirmação)", async () => {
    const result = await new HomeStagingActCapability().execute({
      ...BASE_INPUT,
      temporaryObjects: [{ x: 0, y: 0, width: 10, height: 10 }],
    });

    expect(result.confidence.decision).toBe("confirm");
    expect(result.confidence.shouldExecuteAutomatically).toBe(false);
  });

  it("nunca gera coordenadas negativas mesmo com bounding box parcialmente fora do frame", async () => {
    const result = await new HomeStagingActCapability().execute({
      ...BASE_INPUT,
      temporaryObjects: [{ x: -5, y: -5, width: 20, height: 20 }],
    });

    expect(result.output.legacyFilters[0]).toBe(
      "delogo=x=0:y=0:w=20:h=20:enable='between(t,0,2)'",
    );
  });

  it("cai no fallback mesmo com um modelPath configurado, se o arquivo não existir de verdade", async () => {
    const result = await new HomeStagingActCapability(
      "/caminho/que/nao/existe/lama_inpainting.onnx",
    ).execute({
      ...BASE_INPUT,
      temporaryObjects: [{ x: 0, y: 0, width: 10, height: 10 }],
    });

    expect(result.output.usedRealInpainting).toBe(false);
    expect(result.output.legacyFilters.length).toBe(1);
  });
});
