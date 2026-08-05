import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HomeStagingActCapability } from "../HomeStagingActCapability.js";

const REAL_MODEL_PATH = join(__dirname, "../../../../models/lama_inpainting.onnx");
const REAL_VIDEO_PATH = join(__dirname, "../__fixtures__/bedroom-sample.mp4");
const hasRealModel = existsSync(REAL_MODEL_PATH);

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

describe.skipIf(!hasRealModel)("HomeStagingActCapability (com modelo LaMa real disponível)", () => {
  // Este teste EXIGE inpainting real (não aceita mais o fallback como
  // desfecho válido). Versões anteriores aceitavam os dois porque o
  // onnxruntime-node <=1.23.x — a última linha com binário pra macOS Intel —
  // rejeita, na inferência de shape, os nós DFT(inverse=1, onesided=1) que o
  // LaMa gera nas suas Fast Fourier Convolutions, e o modelo simplesmente não
  // carregava. Isso foi resolvido reescrevendo o MODELO (não esperando um
  // runtime novo): `tools/inpainting/patch_dft_irfft.py` troca esses nós por
  // uma construção equivalente que o runtime antigo aceita — saída idêntica
  // bit a bit, verificada contra o modelo original num runtime moderno. Ver
  // docs/ml/HOME_STAGING.md. Se algum dia isso regredir (modelo reexportado
  // sem o patch, por exemplo), este teste falha em vez de degradar em
  // silêncio pro delogo.
  it("usa inpainting real (LaMa) quando a cena é estática", async () => {
    const result = await new HomeStagingActCapability(REAL_MODEL_PATH).execute({
      ...BASE_INPUT,
      filePath: REAL_VIDEO_PATH,
      temporaryObjects: [{ x: 20, y: 20, width: 30, height: 30 }],
      sceneIsStatic: true,
    });

    expect(result.output.usedRealInpainting).toBe(true);
    expect(result.output.overlay).not.toBeNull();
    expect(result.output.legacyFilters).toHaveLength(0);
  }, 30000);

  it("cai pro fallback delogo quando a câmera está em movimento na cena, mesmo com o modelo real disponível — overlay estático de um frame só ficaria descolado do vídeo", async () => {
    const result = await new HomeStagingActCapability(REAL_MODEL_PATH).execute({
      ...BASE_INPUT,
      filePath: REAL_VIDEO_PATH,
      temporaryObjects: [{ x: 20, y: 20, width: 30, height: 30 }],
      sceneIsStatic: false,
    });

    expect(result.output.usedRealInpainting).toBe(false);
    expect(result.output.overlay).toBeNull();
    expect(result.output.legacyFilters.length).toBe(1);
    expect(result.output.description).toContain("câmera em movimento");
  });
});
