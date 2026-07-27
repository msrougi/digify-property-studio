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
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  async save(project: Project): Promise<void> {
    const props = project.toProps();
    this.db
      .prepare(
        `INSERT INTO projects (id, name, source_video_path, source_video_hash, status, created_at, updated_at)
         VALUES (@id, @name, @sourceVideoPath, @sourceVideoHash, @status, @createdAt, @updatedAt)
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
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
