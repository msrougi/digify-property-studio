import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { extname, join } from "node:path";
import {
  COMMERCIAL_SAFE_LICENSES,
  type MusicLibrary,
  type MusicLicense,
  type MusicSearchQuery,
  type MusicSearchResult,
} from "../../application/MusicLibrary.js";
import { creditSidecarPath, type TrackCredit } from "../../application/musicCredits.js";

const API_BASE = "https://api.openverse.org/v1";
/** Identifica o app, como a Openverse pede. Sem isso o limite de uso é mais apertado. */
const USER_AGENT = "DigifyPropertyStudio/1.0 (+https://github.com/msrougi/digify-property-studio)";
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 12;

interface OpenverseAudioItem {
  id?: string;
  title?: string;
  creator?: string;
  license?: string;
  foreign_landing_url?: string;
  url?: string;
  duration?: number;
}

/**
 * Busca e baixa trilhas da Openverse (projeto oficial do Creative Commons).
 *
 * ## Aviso de verificação
 *
 * **O formato da resposta desta API não pôde ser confirmado no ambiente em
 * que este código foi escrito** — o proxy de desenvolvimento nega saída pra
 * internet (`403 to CONNECT`). Os campos abaixo seguem a documentação
 * pública, e a leitura é defensiva de propósito: item sem os campos
 * essenciais é **descartado** em vez de virar uma faixa quebrada na tela.
 * Se a API divergir, o sintoma será "nenhum resultado", não vídeo sem áudio.
 *
 * ## Por que só CC0 e CC BY
 *
 * A Openverse indexa várias licenças, inclusive `NC` (proibida em uso
 * comercial) e `ND` (proibida em obra derivada — e vídeo COM a música por
 * cima é derivada). Um corretor vendendo imóvel é uso comercial, então o
 * filtro não é preferência: é o que mantém a promessa de "música sem dor de
 * cabeça". `by-sa` também fica de fora porque obrigaria o vídeo do cliente a
 * adotar a mesma licença.
 */
export class OpenverseMusicLibrary implements MusicLibrary {
  async search(query: MusicSearchQuery): Promise<MusicSearchResult[]> {
    const params = new URLSearchParams({
      q: query.text,
      license: COMMERCIAL_SAFE_LICENSES.join(","),
      page_size: String(query.limit ?? DEFAULT_LIMIT),
    });

    const response = await this.fetchWithTimeout(`${API_BASE}/audio/?${params.toString()}`);
    if (!response.ok) {
      throw new Error(
        `A busca de trilhas falhou (${response.status}). Verifique sua conexão e tente de novo.`,
      );
    }

    const body = (await response.json()) as { results?: OpenverseAudioItem[] };
    return (body.results ?? [])
      .map((item) => this.toResult(item))
      .filter((track): track is MusicSearchResult => track !== null);
  }

  async download(track: MusicSearchResult, folder: string): Promise<string> {
    mkdirSync(folder, { recursive: true });

    const response = await this.fetchWithTimeout(track.downloadUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Não consegui baixar "${track.title}" (${response.status}).`);
    }

    const audioPath = join(folder, `${safeFileName(track.title)}${guessExtension(track.downloadUrl)}`);
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(audioPath));

    // A ficha vai junto e é obrigatória, não enfeite: sem ela o crédito de
    // uma faixa CC BY seria impossível de reconstruir depois, e publicar sem
    // crédito é violação de licença.
    const credit: TrackCredit = {
      title: track.title,
      creator: track.creator,
      license: track.license,
      sourceUrl: track.sourceUrl,
    };
    writeFileSync(creditSidecarPath(audioPath), JSON.stringify(credit, null, 2), "utf8");

    return audioPath;
  }

  /**
   * Converte um item da API. Devolve `null` quando falta algo essencial —
   * melhor sumir da lista que virar uma faixa que não toca ou não dá pra
   * creditar.
   */
  private toResult(item: OpenverseAudioItem): MusicSearchResult | null {
    const license = normalizeLicense(item.license);
    if (!license) return null;
    if (!item.id || !item.url || !item.title) return null;

    return {
      id: item.id,
      title: item.title,
      // Faixa CC BY sem autor identificado é impossível de creditar
      // corretamente; "Desconhecido" é honesto e o usuário vê antes de usar.
      creator: item.creator?.trim() || "Autor não informado",
      license,
      sourceUrl: item.foreign_landing_url ?? "https://openverse.org",
      downloadUrl: item.url,
      ...(typeof item.duration === "number" ? { durationSec: Math.round(item.duration / 1000) } : {}),
    };
  }

  /** `fetch` com prazo: API fora do ar não pode deixar a tela travada pra sempre. */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error("A busca de trilhas demorou demais. Tente de novo.");
      }
      // Sem internet o `fetch` REJEITA (não devolve resposta com status), e a
      // mensagem crua é `fetch failed` — que na tela não diz nada a ninguém.
      // Este é o erro mais provável de todos: é o app inteiro funcionando
      // offline, menos esta busca.
      throw new Error(
        "Não consegui falar com o acervo de músicas. Verifique sua conexão com a internet.",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Só as licenças seguras pra uso comercial passam.
 *
 * A checagem é por igualdade exata, não por "contém": `by-nc` contém `by`, e
 * um `includes` deixaria passar justamente a licença que proíbe uso
 * comercial.
 */
function normalizeLicense(raw: string | undefined): MusicLicense | null {
  const value = raw?.trim().toLowerCase();
  return COMMERCIAL_SAFE_LICENSES.find((allowed) => allowed === value) ?? null;
}

/** Nome de arquivo previsível a partir do título da faixa. */
function safeFileName(title: string): string {
  const limpo = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return limpo.length > 0 ? limpo : "trilha";
}

/** Extensão a partir da URL; `.mp3` quando ela não diz. */
function guessExtension(url: string): string {
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    return /^\.(mp3|wav|ogg|flac|m4a|opus)$/.test(ext) ? ext : ".mp3";
  } catch {
    return ".mp3";
  }
}
