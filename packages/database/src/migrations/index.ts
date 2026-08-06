import { INIT_MIGRATION_SQL } from "./001_init.js";
import { PROJECT_VIDEO_METADATA_SQL } from "./002_project_video_metadata.js";
import { RENDERS_SQL } from "./003_renders.js";

export interface Migration {
  id: string;
  sql: string;
}

/**
 * Ordem de aplicação — nunca reordenar ou editar uma migration já publicada.
 * Mudanças estruturais viram uma nova entrada aqui (docs/ENGINEERING_STANDARDS.md).
 */
export const MIGRATIONS: Migration[] = [
  { id: "001_init", sql: INIT_MIGRATION_SQL },
  { id: "002_project_video_metadata", sql: PROJECT_VIDEO_METADATA_SQL },
  { id: "003_renders", sql: RENDERS_SQL },
];
