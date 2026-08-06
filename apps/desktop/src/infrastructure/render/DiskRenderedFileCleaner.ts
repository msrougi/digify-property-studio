import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { RenderedFileCleaner } from "../../application/RenderedFileCleaner.js";

/**
 * Esvazia o diretório de renders. Só mexe no diretório que o próprio app
 * criou pra isso — o vídeo de origem do usuário fica onde ele escolheu e
 * nunca é tocado.
 */
export class DiskRenderedFileCleaner implements RenderedFileCleaner {
  constructor(private readonly rendersDir: string) {}

  async deleteAll(): Promise<void> {
    if (!existsSync(this.rendersDir)) return;
    for (const entry of readdirSync(this.rendersDir)) {
      try {
        rmSync(join(this.rendersDir, entry), { recursive: true, force: true });
      } catch (error) {
        // Um arquivo preso (player ainda com handle aberto, antivírus) não
        // pode impedir o usuário de importar um vídeo novo.
        console.error(`[renders] não consegui apagar ${entry}:`, error);
      }
    }
  }
}
