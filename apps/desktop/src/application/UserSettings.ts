/**
 * Preferências de marca do usuário — o que ele NÃO deveria reescolher a cada
 * vídeo.
 *
 * Deliberadamente separado do estado de sessão: `sessionData.ts` apaga
 * projetos e vídeos a cada abertura porque o app é uma ferramenta de
 * passagem, mas o logo da imobiliária e a pasta de trilhas são configuração
 * de quem usa. Fazer o corretor reapontar o próprio logo toda vez seria
 * atrito puro.
 */
export interface UserSettings {
  /** Logo da marca, reaproveitado em todo vídeo. */
  logoPath?: string;
  /** Como o logo aparece por padrão. */
  logoMode?: "intro" | "watermark" | "both";
  /**
   * Pasta com as trilhas do usuário.
   *
   * O caminho recomendado é baixar faixas da **YouTube Audio Library** (livres
   * pra uso comercial) numa pasta e apontar aqui — assim escolher a música
   * vira um clique numa lista, em vez de navegar o diálogo de arquivos toda
   * vez.
   */
  musicFolder?: string;
}

export interface UserSettingsStore {
  read(): UserSettings;
  write(settings: UserSettings): void;
}

/** Uma faixa disponível na pasta de trilhas. */
export interface MusicTrack {
  path: string;
  /** Nome do arquivo sem extensão — é o que o usuário reconhece. */
  name: string;
}
