import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, basename } from "node:path";
import type {
  MusicTrack,
  UserSettings,
  UserSettingsStore,
} from "../../application/UserSettings.js";

/** Extensões que o FFmpeg embarcado lê sem drama. */
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".opus"]);

/**
 * Preferências em JSON simples no diretório de dados do app.
 *
 * Fica FORA da lista de `sessionData.ts` de propósito: aquilo apaga projetos
 * e vídeos a cada abertura (o app é ferramenta de passagem), mas o logo e a
 * pasta de trilhas são configuração de quem usa e precisam sobreviver.
 */
export class DiskUserSettings implements UserSettingsStore {
  constructor(private readonly filePath: string) {}

  read(): UserSettings {
    if (!existsSync(this.filePath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as UserSettings;
      // Caminho que não existe mais (logo movido, pendrive removido) é pior
      // que caminho nenhum: o render falharia lá na frente com "arquivo não
      // encontrado". Melhor esquecer aqui.
      return {
        ...(parsed.logoPath && existsSync(parsed.logoPath) ? { logoPath: parsed.logoPath } : {}),
        ...(parsed.logoMode ? { logoMode: parsed.logoMode } : {}),
        ...(parsed.musicFolder && existsSync(parsed.musicFolder)
          ? { musicFolder: parsed.musicFolder }
          : {}),
      };
    } catch (error) {
      // Arquivo corrompido não pode impedir o app de abrir — começa limpo.
      console.error("[preferências] arquivo ilegível, começando do zero:", error);
      return {};
    }
  }

  write(settings: UserSettings): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf8");
  }
}

/**
 * Lista as faixas de uma pasta, em ordem alfabética.
 *
 * Só o primeiro nível: subpastas costumam ser organização do usuário
 * (por gênero, por projeto) e varrer tudo devolveria uma lista longa demais
 * pra escolher num clique.
 */
export function listMusicTracks(folder: string): MusicTrack[] {
  if (!existsSync(folder)) return [];
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({
        path: join(folder, entry.name),
        name: basename(entry.name, extname(entry.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  } catch (error) {
    console.error(`[trilhas] não consegui ler ${folder}:`, error);
    return [];
  }
}
