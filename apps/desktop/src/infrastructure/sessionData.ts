import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Artefatos gerados PELO app — tudo descartável. O vídeo de origem que o
 * usuário importou nunca entra aqui: ele é um arquivo do próprio usuário,
 * em algum lugar do disco dele, e o app só guarda o caminho.
 */
const GENERATED_ENTRIES = [
  "digify.sqlite",
  // WAL do SQLite (`journal_mode = WAL` em connection.ts) — apagar só o
  // .sqlite deixaria transações pendentes nesses dois, ressuscitando dados
  // que deveriam ter sumido.
  "digify.sqlite-wal",
  "digify.sqlite-shm",
  "renders",
  "slideshow",
  "inpainting-patches",
  "reflection-patches",
];

/**
 * Apaga todo o estado da sessão anterior: o app é uma ferramenta de
 * passagem (envia → trata → baixa → acabou), não uma biblioteca de vídeos.
 * Decisão de produto explícita do dono do produto — nada de histórico
 * acumulando entre execuções.
 *
 * Chamado no START (não só no encerramento) de propósito: se o app for
 * fechado à força, travar ou cair, o handler de saída não roda — limpar na
 * abertura garante sessão limpa de verdade em qualquer cenário, inclusive
 * nesses.
 */
export function clearSessionData(userDataDir: string): void {
  for (const entry of GENERATED_ENTRIES) {
    const target = join(userDataDir, entry);
    if (!existsSync(target)) continue;
    try {
      rmSync(target, { recursive: true, force: true });
    } catch (error) {
      // Melhor abrir com sobra de sessão anterior do que não abrir —
      // arquivo pode estar preso por outro processo/antivírus.
      console.error(`[sessão] não consegui limpar ${target}:`, error);
    }
  }
}
