import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clearSessionData } from "../sessionData.js";

describe("clearSessionData", () => {
  it("apaga banco (incluindo WAL) e artefatos gerados, deixando a sessão limpa de verdade", () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-session-"));

    writeFileSync(join(dir, "digify.sqlite"), "banco");
    writeFileSync(join(dir, "digify.sqlite-wal"), "wal");
    writeFileSync(join(dir, "digify.sqlite-shm"), "shm");
    mkdirSync(join(dir, "renders"));
    writeFileSync(join(dir, "renders", "projeto.mp4"), "vídeo renderizado");
    mkdirSync(join(dir, "inpainting-patches"));
    writeFileSync(join(dir, "inpainting-patches", "patch.png"), "patch");
    mkdirSync(join(dir, "reflection-patches"));
    writeFileSync(join(dir, "reflection-patches", "patch.png"), "patch");

    clearSessionData(dir);

    expect(existsSync(join(dir, "digify.sqlite"))).toBe(false);
    expect(existsSync(join(dir, "digify.sqlite-wal"))).toBe(false);
    expect(existsSync(join(dir, "digify.sqlite-shm"))).toBe(false);
    expect(existsSync(join(dir, "renders"))).toBe(false);
    expect(existsSync(join(dir, "inpainting-patches"))).toBe(false);
    expect(existsSync(join(dir, "reflection-patches"))).toBe(false);
  });

  it("nunca toca em nada que não seja artefato gerado pelo app", () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-session-keep-"));
    // O vídeo de origem é arquivo DO USUÁRIO — o app só guarda o caminho,
    // apagá-lo seria destruir dado que não é nosso. Configurações do
    // Electron no mesmo diretório também não são nossas.
    writeFileSync(join(dir, "video-do-usuario.mp4"), "não pode sumir");
    writeFileSync(join(dir, "Preferences"), "config do Electron");
    mkdirSync(join(dir, "Cache"));

    clearSessionData(dir);

    expect(existsSync(join(dir, "video-do-usuario.mp4"))).toBe(true);
    expect(existsSync(join(dir, "Preferences"))).toBe(true);
    expect(existsSync(join(dir, "Cache"))).toBe(true);
  });

  it("não quebra quando não há nada pra limpar (primeira execução)", () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-session-vazio-"));
    expect(() => clearSessionData(dir)).not.toThrow();
  });
});
