import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations/index.js";

/**
 * Abre (ou cria) o banco local SQLite e aplica as migrations pendentes, uma única
 * vez cada, controladas por `schema_migrations`. Nunca armazena vídeo — apenas
 * metadados estruturados (docs/00-ARCHITECTURE.md, seção 9).
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );

  const alreadyApplied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map(
      (row) => row.id,
    ),
  );

  const markApplied = db.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (@id, @appliedAt)",
  );

  for (const migration of MIGRATIONS) {
    if (alreadyApplied.has(migration.id)) continue;

    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      markApplied.run({ id: migration.id, appliedAt: new Date().toISOString() });
    });
    applyMigration();
  }

  return db;
}
