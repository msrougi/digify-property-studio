export const MEDIA_PROTOCOL = "digify-media";

/**
 * Host fixo e não vazio. Esquemas customizados marcados `standard: true`
 * (main/index.ts) NÃO tratam host vazio como o `file://` nativo trata —
 * `digify-media:///a/b` faz o Chromium engolir o primeiro segmento do path
 * ("a") como se fosse o host, corrompendo o caminho. Um host fixo evita isso.
 */
const MEDIA_HOST = "local-file";

/**
 * Converte um caminho absoluto de arquivo (POSIX, começa com "/") em uma URL
 * reproduzível pelo <video> do renderer. Codifica cada segmento do caminho
 * separadamente (preservando as barras reais como separadores) em vez de usar
 * `pathToFileURL` do Node — o preload sandboxado do Electron
 * (webPreferences.sandbox: true, main/index.ts) faz polyfill de um subconjunto
 * pequeno do módulo `url`, sem essa função, e falha nesse contexto
 * especificamente (funcionaria normalmente no processo main, que tem Node
 * completo, mas essa função roda no preload/renderer).
 */
export function toMediaUrl(absoluteFilePath: string): string {
  const encodedPath = absoluteFilePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${MEDIA_PROTOCOL}://${MEDIA_HOST}${encodedPath}`;
}

/** Inverso de `toMediaUrl` — usado pelo `protocol.handle` no processo main. */
export function mediaUrlToFileUrl(mediaUrl: string): string {
  const { pathname } = new URL(mediaUrl);
  return `file://${pathname}`;
}
