// Metadados reais de vídeo (ffprobe) passam a viver no próprio projeto —
// docs/CAPABILITY_REGISTRY.md, capability `intake`.
export const PROJECT_VIDEO_METADATA_SQL = `
ALTER TABLE projects ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN width INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN height INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN fps REAL NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN codec_name TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN has_audio INTEGER NOT NULL DEFAULT 0;
`;
