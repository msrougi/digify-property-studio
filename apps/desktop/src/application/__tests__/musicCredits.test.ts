import { describe, expect, it } from "vitest";
import { buildCreditsText, creditSidecarPath, type TrackCredit } from "../musicCredits.js";

const CC_BY: TrackCredit = {
  title: "Sunset Drive",
  creator: "Ana Ribeiro",
  license: "by",
  sourceUrl: "https://exemplo.org/faixa/1",
};

const CC0: TrackCredit = {
  title: "Quiet Morning",
  creator: "João Alves",
  license: "cc0",
  sourceUrl: "https://exemplo.org/faixa/2",
};

describe("buildCreditsText", () => {
  it("credita faixa CC BY com autor, título, licença e origem", () => {
    const texto = buildCreditsText([CC_BY]);
    expect(texto).toContain("Sunset Drive");
    expect(texto).toContain("Ana Ribeiro");
    expect(texto).toContain("CC BY 4.0");
    expect(texto).toContain("https://exemplo.org/faixa/1");
  });

  it("não credita CC0 — não exige nada e só ocuparia espaço na descrição", () => {
    expect(buildCreditsText([CC0])).toBe("");
  });

  it("com as duas, credita só a que exige", () => {
    const texto = buildCreditsText([CC0, CC_BY]);
    expect(texto).toContain("Sunset Drive");
    expect(texto).not.toContain("Quiet Morning");
  });

  it("sem faixa nenhuma devolve vazio, pra quem chama não criar arquivo à toa", () => {
    expect(buildCreditsText([])).toBe("");
  });
});

describe("creditSidecarPath", () => {
  it("acrescenta sufixo em vez de trocar a extensão", () => {
    // `trilha.mp3` e `trilha.wav` na mesma pasta não podem disputar a mesma
    // ficha — uma sobrescreveria o crédito da outra.
    expect(creditSidecarPath("/musicas/trilha.mp3")).toBe("/musicas/trilha.mp3.credito.json");
    expect(creditSidecarPath("/musicas/trilha.wav")).toBe("/musicas/trilha.wav.credito.json");
    expect(creditSidecarPath("/musicas/trilha.mp3")).not.toBe(
      creditSidecarPath("/musicas/trilha.wav"),
    );
  });
});
