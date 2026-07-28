import { describe, expect, it } from "vitest";
import { HomeStagingActCapability } from "../HomeStagingActCapability.js";

describe("HomeStagingActCapability", () => {
  it("não decide nada quando não há objetos temporários", async () => {
    const result = await new HomeStagingActCapability().execute({ temporaryObjects: [] });

    expect(result.output.ffmpegFilters).toHaveLength(0);
    expect(result.output.itemsAddressed).toBe(0);
  });

  it("gera um filtro delogo por objeto temporário detectado, restrito à janela de tempo da cena", async () => {
    const result = await new HomeStagingActCapability().execute({
      temporaryObjects: [
        { x: 10, y: 20, width: 30, height: 40, sceneStartMs: 0, sceneEndMs: 2000 },
        { x: 100, y: 50, width: 25, height: 25, sceneStartMs: 2000, sceneEndMs: 4000 },
      ],
    });

    expect(result.output.ffmpegFilters).toEqual([
      "delogo=x=10:y=20:w=30:h=40:enable='between(t,0,2)'",
      "delogo=x=100:y=50:w=25:h=25:enable='between(t,2,4)'",
    ]);
    expect(result.output.itemsAddressed).toBe(2);
  });

  it("nunca reporta confidence alto o bastante pra auto-executar (técnica limitada, exige confirmação)", async () => {
    const result = await new HomeStagingActCapability().execute({
      temporaryObjects: [{ x: 0, y: 0, width: 10, height: 10, sceneStartMs: 0, sceneEndMs: 1000 }],
    });

    expect(result.confidence.decision).toBe("confirm");
    expect(result.confidence.shouldExecuteAutomatically).toBe(false);
  });

  it("nunca gera coordenadas negativas mesmo com bounding box parcialmente fora do frame", async () => {
    const result = await new HomeStagingActCapability().execute({
      temporaryObjects: [{ x: -5, y: -5, width: 20, height: 20, sceneStartMs: 0, sceneEndMs: 1000 }],
    });

    expect(result.output.ffmpegFilters[0]).toBe(
      "delogo=x=0:y=0:w=20:h=20:enable='between(t,0,1)'",
    );
  });
});
