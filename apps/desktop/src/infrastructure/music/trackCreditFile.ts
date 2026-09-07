import { readFileSync } from "node:fs";
import { creditSidecarPath, type TrackCredit } from "../../application/musicCredits.js";
import { COMMERCIAL_SAFE_LICENSES } from "../../application/MusicLibrary.js";

/**
 * Lê a ficha gravada ao lado de uma trilha baixada.
 *
 * Devolve `null` quando não há ficha — que é o caso normal de uma música que o
 * usuário colocou na pasta por conta própria. Isso **não** é erro: só significa
 * que este app não tem como afirmar nada sobre a licença dela, e portanto não
 * inventa um crédito.
 *
 * A validação é estrita de propósito. O arquivo fica numa pasta que o usuário
 * pode editar; uma ficha corrompida ou com licença desconhecida tem que virar
 * "sem crédito" e não um texto de crédito errado — afirmar a licença errada na
 * descrição de um post é pior que não afirmar nada.
 */
export function readTrackCredit(audioPath: string): TrackCredit | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(creditSidecarPath(audioPath), "utf8"));
  } catch {
    return null;
  }

  if (typeof bruto !== "object" || bruto === null) return null;
  const { title, creator, license, sourceUrl } = bruto as Record<string, unknown>;

  if (typeof title !== "string" || title.trim() === "") return null;
  if (typeof creator !== "string" || creator.trim() === "") return null;
  if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") return null;
  if (!COMMERCIAL_SAFE_LICENSES.some((allowed) => allowed === license)) return null;

  return { title, creator, license: license as TrackCredit["license"], sourceUrl };
}
