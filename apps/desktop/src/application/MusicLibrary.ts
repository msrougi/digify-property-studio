/**
 * Licenças aceitas para trilha de vídeo COMERCIAL.
 *
 * A lista é curta de propósito. O usuário escolheu a YouTube Audio Library
 * justamente pra não ter dor de cabeça com direitos; trazer uma busca online
 * que devolve faixa `NC` (proibida em uso comercial) ou `ND` (proibida em
 * obra derivada — e um vídeo COM a música por cima é obra derivada)
 * reintroduziria exatamente o risco que se queria evitar.
 *
 * - `cc0`: domínio público efetivo. Comercial livre, **sem** atribuição.
 * - `by`: comercial livre, **exige crédito**.
 * - `by-sa`: comercial livre, exige crédito e obriga a obra derivada a ficar
 *   sob a mesma licença — o que contamina o vídeo do cliente. Fica de fora.
 */
export const COMMERCIAL_SAFE_LICENSES = ["cc0", "by"] as const;

export type MusicLicense = (typeof COMMERCIAL_SAFE_LICENSES)[number];

export interface MusicSearchResult {
  id: string;
  title: string;
  /** Autor — obrigatório no crédito de faixas `by`. */
  creator: string;
  license: MusicLicense;
  /** Página da faixa na origem. Entra no crédito e permite conferir a licença. */
  sourceUrl: string;
  /** Arquivo de áudio em si. */
  downloadUrl: string;
  durationSec?: number;
}

export interface MusicSearchQuery {
  text: string;
  /** Limite de resultados. A tela mostra poucos: escolher trilha é ouvir, não rolar lista. */
  limit?: number;
}

/**
 * Porta pra buscar e baixar trilhas de um acervo aberto.
 *
 * Existe como interface porque a implementação real faz chamada de rede, e o
 * ambiente de desenvolvimento deste projeto não tem saída pra internet — o
 * comportamento é testado com um dublê, e o adaptador HTTP é verificado na
 * máquina de quem usa.
 */
export interface MusicLibrary {
  search(query: MusicSearchQuery): Promise<MusicSearchResult[]>;
  /**
   * Baixa a faixa para `folder` e devolve o caminho do arquivo.
   *
   * A implementação também grava a ficha da faixa (autor, licença, origem) ao
   * lado do áudio — sem isso o crédito seria impossível de reconstruir depois,
   * e faixa `by` sem crédito é violação de licença.
   */
  download(track: MusicSearchResult, folder: string): Promise<string>;
}
