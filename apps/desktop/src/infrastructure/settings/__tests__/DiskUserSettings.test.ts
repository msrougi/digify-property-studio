import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DiskUserSettings, listMusicTracks } from "../DiskUserSettings.js";

function novoDir(prefixo: string): string {
  return mkdtempSync(join(tmpdir(), prefixo));
}

describe("DiskUserSettings", () => {
  it("guarda e recupera as preferências entre execuções", () => {
    const dir = novoDir("digify-cfg-");
    const logo = join(dir, "logo.png");
    writeFileSync(logo, "png");

    const store = new DiskUserSettings(join(dir, "preferencias.json"));
    store.write({ logoPath: logo, logoMode: "watermark", musicFolder: dir });

    // Store NOVO sobre o mesmo arquivo: prova que veio do disco, não de
    // estado em memória.
    expect(new DiskUserSettings(join(dir, "preferencias.json")).read()).toEqual({
      logoPath: logo,
      logoMode: "watermark",
      musicFolder: dir,
    });
  });

  it("esquece caminho que não existe mais em vez de devolver referência quebrada", () => {
    // Logo movido, pendrive removido, pasta renomeada. Devolver o caminho
    // velho faria o render falhar lá na frente com "arquivo não encontrado";
    // esquecer aqui faz a tela simplesmente pedir de novo.
    const dir = novoDir("digify-cfg-sumido-");
    const arquivo = join(dir, "preferencias.json");
    writeFileSync(
      arquivo,
      JSON.stringify({
        logoPath: join(dir, "logo-que-sumiu.png"),
        logoMode: "both",
        musicFolder: join(dir, "pasta-que-sumiu"),
      }),
    );

    // `logoMode` sobrevive: é preferência pura, não aponta pra disco nenhum.
    expect(new DiskUserSettings(arquivo).read()).toEqual({ logoMode: "both" });
  });

  it("arquivo corrompido não impede o app de abrir", () => {
    const dir = novoDir("digify-cfg-corrompido-");
    const arquivo = join(dir, "preferencias.json");
    writeFileSync(arquivo, "{ isto não é json válido");

    expect(new DiskUserSettings(arquivo).read()).toEqual({});
  });

  it("sem arquivo nenhum, começa vazio (primeira execução)", () => {
    const dir = novoDir("digify-cfg-vazio-");
    expect(new DiskUserSettings(join(dir, "nao-existe.json")).read()).toEqual({});
  });
});

describe("listMusicTracks", () => {
  it("lista só áudio do primeiro nível, em ordem alfabética e sem extensão no nome", () => {
    const dir = novoDir("digify-trilhas-");
    for (const nome of ["Sunset.mp3", "Ambient.wav", "readme.txt", "capa.png", "Bossa.m4a"]) {
      writeFileSync(join(dir, nome), "x");
    }
    // Subpasta é organização do usuário — varrer tudo daria lista longa
    // demais pra escolher num clique.
    mkdirSync(join(dir, "arquivadas"));
    writeFileSync(join(dir, "arquivadas", "Antiga.mp3"), "x");

    expect(listMusicTracks(dir).map((t) => t.name)).toEqual(["Ambient", "Bossa", "Sunset"]);
  });

  it("pasta inexistente devolve lista vazia em vez de estourar", () => {
    expect(listMusicTracks(join(tmpdir(), "pasta-que-nunca-existiu-digify"))).toEqual([]);
  });
});
