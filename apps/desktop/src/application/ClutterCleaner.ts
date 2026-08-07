export interface ClutterCleanProgress {
  framesProcessed: number;
  /** 0 quando o FPS do vídeo não pôde ser lido — nesse caso não dá pra calcular %. */
  totalFrames: number;
  framesChanged: number;
}

export interface ClutterCleanResult {
  framesProcessed: number;
  framesChanged: number;
  /**
   * `true` quando o vídeo limpo existe de fato em `outputPath`.
   *
   * `false` significa "não havia nada pra remover" — e nesse caso NENHUM
   * arquivo é produzido, de propósito. Recodificar um vídeo sem alterar um
   * pixel sequer só degrada: medido, uma passagem à toa dava PSNR ~46 dB, e
   * o render final ainda recodifica por cima. Quem chama deve continuar
   * usando o vídeo original.
   */
  produced: boolean;
}

/**
 * Porta pra limpar bagunça QUADRO A QUADRO, produzindo um vídeo novo.
 *
 * Existe como interface na camada de aplicação porque o caso de uso não pode
 * conhecer ONNX Runtime nem FFmpeg (docs/ENGINEERING_STANDARDS.md). A
 * implementação real é `infrastructure/render/FrameByFrameCleaner.ts`.
 *
 * `isAvailable()` é parte do contrato porque o modelo de inpainting (~196MB)
 * pode não estar montado — nesse caso o caso de uso cai no caminho antigo
 * (`home_staging.act` com `delogo`) em vez de falhar o render inteiro.
 */
export interface ClutterCleaner {
  isAvailable(): boolean;
  clean(
    sourcePath: string,
    outputPath: string,
    onProgress?: (progress: ClutterCleanProgress) => void,
  ): Promise<ClutterCleanResult>;
  /**
   * Descarta o vídeo intermediário. Quem cria o arquivo sabe descartá-lo — o
   * caso de uso não fala com o disco. Vale a pena chamar: o intermediário é um
   * vídeo inteiro a mais no disco, e ele não serve pra nada depois que o
   * render final termina.
   */
  discard(outputPath: string): Promise<void>;
}
