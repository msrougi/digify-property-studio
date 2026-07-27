import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Abre (ou cria) o banco local SQLite e aplica as migrations pendentes.
 * Nunca armazena vídeo — apenas metadados estruturados (docs/00-ARCHITECTURE.md, seção 9).
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const migration = readFileSync(join(currentDir, "migrations", "001_init.sql"), "utf-8");
  db.exec(migration);

  return db;
}
