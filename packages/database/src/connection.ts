import Database from "better-sqlite3";
import { INIT_MIGRATION_SQL } from "./migrations/001_init.js";

/**
 * Abre (ou cria) o banco local SQLite e aplica as migrations pendentes.
 * Nunca armazena vídeo — apenas metadados estruturados (docs/00-ARCHITECTURE.md, seção 9).
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(INIT_MIGRATION_SQL);

  return db;
}
