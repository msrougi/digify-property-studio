-- docs/00-ARCHITECTURE.md, seção 9: banco local nunca armazena vídeo, apenas metadados.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_video_path TEXT NOT NULL,
  source_video_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  room_type TEXT,
  room_confidence REAL
);

CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  bbox_x REAL NOT NULL,
  bbox_y REAL NOT NULL,
  bbox_width REAL NOT NULL,
  bbox_height REAL NOT NULL,
  confidence REAL NOT NULL,
  removable INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_objects_scene_id ON objects(scene_id);
