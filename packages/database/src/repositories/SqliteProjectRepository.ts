import type Database from "better-sqlite3";
import { Project, type ProjectRepository, type ProjectStatus } from "@digify/domain";

interface ProjectRow {
  id: string;
  name: string;
  source_video_path: string;
  source_video_hash: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  codec_name: string;
  has_audio: number;
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  async save(project: Project): Promise<void> {
    const props = project.toProps();
    this.db
      .prepare(
        `INSERT INTO projects (
           id, name, source_video_path, source_video_hash, status,
           duration_ms, width, height, fps, codec_name, has_audio,
           created_at, updated_at
         )
         VALUES (
           @id, @name, @sourceVideoPath, @sourceVideoHash, @status,
           @durationMs, @width, @height, @fps, @codecName, @hasAudio,
           @createdAt, @updatedAt
         )
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: props.id,
        name: props.name,
        sourceVideoPath: props.sourceVideoPath,
        sourceVideoHash: props.sourceVideoHash,
        status: props.status,
        durationMs: props.video.durationMs,
        width: props.video.width,
        height: props.video.height,
        fps: props.video.fps,
        codecName: props.video.codecName,
        hasAudio: props.video.hasAudio ? 1 : 0,
        createdAt: props.createdAt.toISOString(),
        updatedAt: props.updatedAt.toISOString(),
      });
  }

  async findById(id: string): Promise<Project | null> {
    const row = this.db
      .prepare<{ id: string }, ProjectRow>("SELECT * FROM projects WHERE id = @id")
      .get({ id }) as ProjectRow | undefined;

    return row ? this.toEntity(row) : null;
  }

  async list(): Promise<Project[]> {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as ProjectRow[];

    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: ProjectRow): Project {
    return Project.restore({
      id: row.id,
      name: row.name,
      sourceVideoPath: row.source_video_path,
      sourceVideoHash: row.source_video_hash,
      status: row.status,
      video: {
        durationMs: row.duration_ms,
        width: row.width,
        height: row.height,
        fps: row.fps,
        codecName: row.codec_name,
        hasAudio: row.has_audio === 1,
      },
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  async deleteAll(): Promise<void> {
    // `ON DELETE CASCADE` nas FKs leva scenes/objects/renders junto —
    // `foreign_keys = ON` está ligado em connection.ts, sem isso o SQLite
    // ignoraria a cascata em silêncio e deixaria órfãos.
    this.db.prepare("DELETE FROM projects").run();
  }
}
