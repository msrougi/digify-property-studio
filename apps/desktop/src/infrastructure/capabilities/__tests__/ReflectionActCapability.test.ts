import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReflectionActCapability } from "../ReflectionActCapability.js";

const BASE_INPUT = {
  filePath: "src/infrastructure/capabilities/__fixtures__/bedroom-sample.mp4",
  atMs: 500,
  frameWidth: 1920,
  frameHeight: 1080,
  sceneStartMs: 0,
  sceneEndMs: 2000,
};

describe("ReflectionActCapability", () => {
  it("não gera overlay quando meanAbsoluteChange está abaixo do limiar", async () => {
    const result = await new ReflectionActCapability().execute({
      ...BASE_INPUT,
      meanAbsoluteChange: 0.0001,
    });

    expect(result.output.overlay).toBeNull();
  });

  it("gera de verdade um PNG real cobrindo o frame inteiro quando há sinal suficiente", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-reflection-act-"));
    const result = await new ReflectionActCapability(dir).execute({
      ...BASE_INPUT,
      meanAbsoluteChange: 0.03,
    });

    expect(result.output.overlay).not.toBeNull();
    const overlay = result.output.overlay;
    if (!overlay) throw new Error("overlay não deveria ser null aqui");
    expect(existsSync(overlay.imagePath)).toBe(true);
    expect(overlay.x).toBe(0);
    expect(overlay.y).toBe(0);
    expect(overlay.width).toBe(1920);
    expect(overlay.height).toBe(1080);
    expect(overlay.startSec).toBe(0);
    expect(overlay.endSec).toBe(2);
  }, 30000);

  it("nunca reporta confidence alto o bastante pra auto-executar (correção global de imagem, exige confirmação)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-reflection-act-confirm-"));
    const result = await new ReflectionActCapability(dir).execute({
      ...BASE_INPUT,
      meanAbsoluteChange: 0.03,
    });

    expect(result.confidence.decision).toBe("confirm");
    expect(result.confidence.shouldExecuteAutomatically).toBe(false);
  }, 30000);

  it("não gera overlay quando a câmera está em movimento na cena, mesmo com sinal de reflexo forte — um overlay de um frame só ficaria descolado do vídeo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-reflection-act-motion-"));
    const result = await new ReflectionActCapability(dir).execute({
      ...BASE_INPUT,
      meanAbsoluteChange: 0.03,
      sceneIsStatic: false,
    });

    expect(result.output.overlay).toBeNull();
    expect(result.output.description).toContain("câmera em movimento");
  });
});
