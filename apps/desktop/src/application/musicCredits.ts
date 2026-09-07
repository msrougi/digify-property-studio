import type { MusicLicense } from "./MusicLibrary.js";

/** Ficha gravada ao lado do arquivo de áudio, pra reconstruir o crédito depois. */
export interface TrackCredit {
  title: string;
  creator: string;
  license: MusicLicense;
  sourceUrl: string;
}

const LICENSE_LABEL: Record<MusicLicense, string> = {
  cc0: "CC0 (domínio público)",
  by: "CC BY 4.0",
};

/**
 * Monta o texto de crédito pra colar na descrição do post.
 *
 * Por que isto existe: faixa `CC BY` **exige** citar autor, título, licença e
 * origem. Sem gerar o texto, o corretor publicaria sem crédito e estaria em
 * violação — o que anula a razão de ter escolhido música livre. Deixar o
 * usuário montar isso à mão seria um convite a esquecer.
 *
 * Faixa `CC0` não exige nada e é omitida: encher a descrição com crédito
 * desnecessário só ocupa espaço que o anúncio quer usar pra vender.
 *
 * Devolve string vazia quando não há nada a creditar — quem chama usa isso
 * pra não criar arquivo à toa.
 */
export function buildCreditsText(tracks: TrackCredit[]): string {
  const precisamCredito = tracks.filter((track) => track.license !== "cc0");
  if (precisamCredito.length === 0) return "";

  const linhas = precisamCredito.map(
    (track) =>
      `"${track.title}" por ${track.creator} — ${LICENSE_LABEL[track.license]} — ${track.sourceUrl}`,
  );

  return ["Créditos de música:", ...linhas].join("\n") + "\n";
}

/** Caminho da ficha que acompanha um arquivo de áudio baixado. */
export function creditSidecarPath(audioPath: string): string {
  // Sufixo em vez de trocar a extensão: `.mp3` e `.wav` de mesmo nome
  // conviveriam na pasta e sobrescreveriam a ficha um do outro.
  return `${audioPath}.credito.json`;
}
