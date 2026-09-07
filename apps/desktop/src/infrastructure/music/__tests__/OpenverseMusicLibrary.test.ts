import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creditSidecarPath } from "../../../application/musicCredits.js";
import { OpenverseMusicLibrary } from "../OpenverseMusicLibrary.js";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Responde a busca com o corpo dado, sem tocar na rede. */
function mockSearch(results: unknown[]): void {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ results }), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe("OpenverseMusicLibrary — filtro de licença", () => {
  it("pede à API só as licenças seguras pra uso comercial", async () => {
    const chamadas: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      chamadas.push(String(url));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await new OpenverseMusicLibrary().search({ text: "piano" });

    expect(chamadas[0]).toContain("license=cc0%2Cby");
  });

  it.each([
    ["by-nc", "proíbe uso comercial"],
    ["by-nc-sa", "proíbe uso comercial"],
    ["by-nd", "proíbe obra derivada, e vídeo com música por cima é derivada"],
    ["by-sa", "obrigaria o vídeo do cliente à mesma licença"],
    ["", "sem licença declarada"],
    [undefined, "campo ausente"],
  ])("descarta faixa com licença '%s' (%s)", async (license, _motivo) => {
    // Rede pode devolver o que a API mandar; a defesa é local. `by-nc`
    // CONTÉM `by`, então um filtro por substring deixaria passar justamente
    // a licença que proíbe uso comercial.
    mockSearch([
      { id: "1", title: "Faixa", creator: "Alguém", license, url: "https://x/a.mp3" },
    ]);

    expect(await new OpenverseMusicLibrary().search({ text: "q" })).toEqual([]);
  });

  it.each(["cc0", "by", "CC0", "By "])("aceita licença '%s'", async (license) => {
    mockSearch([
      { id: "1", title: "Faixa", creator: "Alguém", license, url: "https://x/a.mp3" },
    ]);

    const encontradas = await new OpenverseMusicLibrary().search({ text: "q" });
    expect(encontradas).toHaveLength(1);
  });
});

describe("OpenverseMusicLibrary — pilha de rede injetada", () => {
  it("usa o fetch recebido, não o global", async () => {
    // O processo main injeta o `net.fetch` do Electron pra respeitar o proxy
    // do sistema. Se esta classe chamasse o `fetch` global por dentro, aquela
    // injeção seria código morto e ninguém perceberia: nesta máquina, sem
    // proxy, os dois se comportam igual.
    globalThis.fetch = vi.fn(async () => {
      throw new Error("o fetch global não devia ter sido chamado");
    }) as unknown as typeof fetch;

    const injetado = vi.fn(
      async () => new Response(JSON.stringify({ results: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    await new OpenverseMusicLibrary(injetado).search({ text: "piano" });

    expect(injetado).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("o download também passa pelo fetch injetado", async () => {
    // Buscar pelo proxy e baixar por fora daria erro só na hora de baixar —
    // o pior momento, depois do usuário já ter escolhido a faixa.
    globalThis.fetch = vi.fn(async () => {
      throw new Error("o fetch global não devia ter sido chamado");
    }) as unknown as typeof fetch;

    const injetado = vi.fn(
      async () => new Response(new Blob([new Uint8Array([1])]), { status: 200 }),
    ) as unknown as typeof fetch;

    await new OpenverseMusicLibrary(injetado).download(
      {
        id: "1",
        title: "Faixa",
        creator: "A",
        license: "cc0",
        sourceUrl: "https://openverse.org/audio/1",
        downloadUrl: "https://exemplo.org/faixa.mp3",
      },
      mkdtempSync(join(tmpdir(), "openverse-inj-")),
    );

    expect(injetado).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("OpenverseMusicLibrary — leitura defensiva", () => {
  it("descarta item sem os campos essenciais em vez de criar faixa quebrada", async () => {
    // O formato desta API não pôde ser confirmado no ambiente de
    // desenvolvimento (sem saída pra internet). Se ela divergir, o sintoma
    // tem que ser "nenhum resultado", nunca uma faixa que não toca.
    mockSearch([
      { title: "Sem id", creator: "A", license: "cc0", url: "https://x/a.mp3" },
      { id: "2", creator: "A", license: "cc0", url: "https://x/b.mp3" },
      { id: "3", title: "Sem url", creator: "A", license: "cc0" },
      { id: "4", title: "Completa", creator: "A", license: "cc0", url: "https://x/d.mp3" },
    ]);

    const encontradas = await new OpenverseMusicLibrary().search({ text: "q" });
    expect(encontradas.map((t) => t.title)).toEqual(["Completa"]);
  });

  it("faixa sem autor vira 'Autor não informado', não string vazia", async () => {
    // Crédito de CC BY precisa de autor. Vazio passaria despercebido no
    // texto do crédito; o rótulo explícito o usuário vê antes de usar.
    mockSearch([
      { id: "1", title: "Faixa", creator: "   ", license: "by", url: "https://x/a.mp3" },
    ]);

    const [faixa] = await new OpenverseMusicLibrary().search({ text: "q" });
    expect(faixa?.creator).toBe("Autor não informado");
  });

  it("resposta de erro da API vira mensagem legível, não exceção crua", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;

    await expect(new OpenverseMusicLibrary().search({ text: "q" })).rejects.toThrow(
      /busca de trilhas falhou \(503\)/i,
    );
  });

  it("sem internet fala de internet, não devolve 'fetch failed'", async () => {
    // Este é o erro MAIS provável: o app inteiro roda offline, menos esta
    // busca. `fetch failed` na tela não diria nada a ninguém.
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const promessa = new OpenverseMusicLibrary().search({ text: "q" });
    await expect(promessa).rejects.toThrow(/verifique sua conexão com a internet/i);
    await expect(promessa).rejects.not.toThrow(/fetch failed/);
  });

  it("prazo estourado tem mensagem própria, diferente de 'sem internet'", async () => {
    // Servidor que aceita a conexão e não responde é outro problema que o de
    // não ter rede — e a saída pro usuário (esperar e tentar de novo) é outra.
    globalThis.fetch = vi.fn(async () => {
      const erro = new Error("The operation was aborted.");
      erro.name = "AbortError";
      throw erro;
    }) as unknown as typeof fetch;

    await expect(new OpenverseMusicLibrary().search({ text: "q" })).rejects.toThrow(
      /demorou demais/i,
    );
  });
});

describe("OpenverseMusicLibrary — download", () => {
  it("grava o áudio e a ficha de crédito ao lado dele", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openverse-"));
    globalThis.fetch = vi.fn(
      async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 }),
    ) as unknown as typeof fetch;

    const caminho = await new OpenverseMusicLibrary().download(
      {
        id: "1",
        title: "Sunset Drive / Versão 2",
        creator: "Ana Ribeiro",
        license: "by",
        sourceUrl: "https://openverse.org/audio/1",
        downloadUrl: "https://exemplo.org/faixa.mp3",
      },
      dir,
    );

    expect(existsSync(caminho)).toBe(true);
    // Barra e acento no título não podem virar caminho inválido. O acento sai
    // da letra sem levar a letra junto: `Versão` vira `Versao`, não `Verso`.
    expect(caminho).toMatch(/Sunset-Drive-Versao-2\.mp3$/);

    // Sem a ficha, o crédito de uma CC BY seria impossível de reconstruir.
    const ficha = JSON.parse(readFileSync(creditSidecarPath(caminho), "utf8")) as Record<string, string>;
    expect(ficha).toEqual({
      title: "Sunset Drive / Versão 2",
      creator: "Ana Ribeiro",
      license: "by",
      sourceUrl: "https://openverse.org/audio/1",
    });
  });
});
