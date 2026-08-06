/**
 * Porta pra apagar os vídeos renderizados do disco. Vive na camada de
 * aplicação como interface porque o caso de uso não pode falar com `fs`
 * direto (docs/ENGINEERING_STANDARDS.md) — a implementação real está em
 * `infrastructure/render/DiskRenderedFileCleaner.ts`.
 */
export interface RenderedFileCleaner {
  deleteAll(): Promise<void>;
}
