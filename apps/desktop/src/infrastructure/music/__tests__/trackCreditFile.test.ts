import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creditSidecarPath } from "../../../application/musicCredits.js";
import { readTrackCredit } from "../trackCreditFile.js";

/** Cria um `trilha.mp3` fictício com a ficha ao lado, e devolve o caminho do áudio. */
function comFicha(conteudo: string): string {
  const audioPath = join(mkdtempSync(join(tmpdir(), "ficha-")), "trilha.mp3");
  writeFileSync(audioPath, "");
  writeFileSync(creditSidecarPath(audioPath), conteudo, "utf8");
  return audioPath;
}

describe("readTrackCredit", () => {
  it("lê a ficha completa de uma faixa CC BY", () => {
    const audioPath = comFicha(
      JSON.stringify({
        title: "Sunset Drive",
        creator: "Ana Ribeiro",
        license: "by",
        sourceUrl: "https://openverse.org/audio/1",
      }),
    );

    expect(readTrackCredit(audioPath)).toEqual({
      title: "Sunset Drive",
      creator: "Ana Ribeiro",
      license: "by",
      sourceUrl: "https://openverse.org/audio/1",
    });
  });

  it("música sem ficha devolve null, e isso não é erro", () => {
    // É o caso normal de quem largou um MP3 na pasta por conta própria. O app
    // não sabe a licença dela, então não afirma nada.
    const audioPath = join(mkdtempSync(join(tmpdir(), "ficha-")), "minha.mp3");
    writeFileSync(audioPath, "");

    expect(readTrackCredit(audioPath)).toBeNull();
  });

  it.each([
    ["ficha corrompida", "{ isso não é json"],
    ["licença desconhecida", '{"title":"T","creator":"C","license":"by-nc","sourceUrl":"https://x"}'],
    ["licença ausente", '{"title":"T","creator":"C","sourceUrl":"https://x"}'],
    ["autor vazio", '{"title":"T","creator":"  ","license":"by","sourceUrl":"https://x"}'],
    ["título ausente", '{"creator":"C","license":"by","sourceUrl":"https://x"}'],
    ["origem ausente", '{"title":"T","creator":"C","license":"by"}'],
    ["não é objeto", '"só uma string"'],
    ["nulo", "null"],
  ])("descarta %s em vez de creditar errado", (_caso, conteudo) => {
    // A pasta é editável pelo usuário. Afirmar a licença errada na descrição
    // de um post publicado é pior que não afirmar nada.
    expect(readTrackCredit(comFicha(conteudo))).toBeNull();
  });
});
