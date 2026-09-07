import { describe, expect, it } from "vitest";
import { formatClock, readableError } from "../format.js";

describe("formatClock", () => {
  it("mostra minutos e segundos com dois dígitos", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9_000)).toBe("0:09");
    expect(formatClock(75_000)).toBe("1:15");
    expect(formatClock(3_600_000)).toBe("60:00");
  });
});

describe("readableError", () => {
  it("tira o embrulho de IPC do Electron", () => {
    // String LITERAL capturada rodando o app com a busca offline. Sem esta
    // limpeza, é isto que apareceria na tela do corretor.
    const doApp = new Error(
      "Error invoking remote method 'music:search': Error: A busca de trilhas falhou (403). Verifique sua conexão e tente de novo.",
    );

    expect(readableError(doApp, "algo deu errado")).toBe(
      "A busca de trilhas falhou (403). Verifique sua conexão e tente de novo.",
    );
  });

  it("tira também o prefixo de erro de domínio", () => {
    const erro = new Error(
      "Error invoking remote method 'music:download': DomainError: Escolha primeiro a pasta onde suas trilhas ficam.",
    );

    expect(readableError(erro, "x")).toBe("Escolha primeiro a pasta onde suas trilhas ficam.");
  });

  it("deixa intacta a mensagem que já é legível", () => {
    expect(readableError(new Error("Logo não encontrado: /tmp/logo.png"), "x")).toBe(
      "Logo não encontrado: /tmp/logo.png",
    );
  });

  it("não come parênteses nem números da mensagem", () => {
    // Regressão: um recorte por índice fixo tiraria o começo da frase útil.
    expect(readableError(new Error("Error: Não consegui baixar \"Faixa\" (404)."), "x")).toBe(
      'Não consegui baixar "Faixa" (404).',
    );
  });

  it("usa o texto reserva quando não sobra mensagem nenhuma", () => {
    // Erro sem texto útil viraria uma caixa de erro vazia — pior que o genérico.
    expect(readableError(new Error(""), "Não conseguimos montar o vídeo.")).toBe(
      "Não conseguimos montar o vídeo.",
    );
    expect(readableError(new Error("Error invoking remote method 'x:y': "), "reserva")).toBe(
      "reserva",
    );
    expect(readableError("nem é um Error", "reserva")).toBe("reserva");
    expect(readableError(undefined, "reserva")).toBe("reserva");
  });
});
