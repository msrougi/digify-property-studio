export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Mensagem de erro como o usuário deve ler.
 *
 * O Electron embrulha toda exceção de handler IPC em
 * `Error invoking remote method '<canal>': Error: <mensagem>`. Sem tirar isso,
 * um erro comum e esperado — buscar trilha sem internet — chega na tela como
 * jargão de programador com o nome do canal interno no meio.
 *
 * Não é suposição: rodando o app, a busca offline produzia literalmente
 * `Error invoking remote method 'music:search': Error: A busca de trilhas
 * falhou (403). Verifique sua conexão e tente de novo.`
 */
export function readableError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const limpa = error.message
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    // A classe do erro vem repetida no texto (`Error:`, `DomainError:`).
    .replace(/^\w*Error:\s*/, "")
    .trim();
  return limpa === "" ? fallback : limpa;
}
