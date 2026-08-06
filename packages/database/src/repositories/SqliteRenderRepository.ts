import type Database from "better-sqlite3";
import { Render, type RenderRepository } from "@digify/domain";

interface RenderRow {
  project_id: string;
  output_path: string;
  applied_corrections: string;
  created_at: string;
}

export class SqliteRenderRepository implements RenderRepository {
  constructor(private readonly db: Database.Database) {}

  async save(render: Render): Promise<void> {
    const props = render.toProps();
    // Um render por projeto — reaplicar melhorias substitui o anterior
    // (o arquivo de saída também é sobrescrito, o caminho é determinístico).
    this.db
      .prepare(
        `INSERT INTO renders (project_id, output_path, applied_corrections, created_at)
         VALUES (@projectId, @outputPath, @appliedCorrections, @createdAt)
         ON CONFLICT(project_id) DO UPDATE SET
           output_path = excluded.output_path,
           applied_corrections = excluded.applied_corrections,
           created_at = excluded.created_at`,
      )
      .run({
        projectId: props.projectId,
        outputPath: props.outputPath,
        appliedCorrections: JSON.stringify(props.appliedCorrections),
        createdAt: props.createdAt.toISOString(),
      });
  }

  async findByProject(projectId: string): Promise<Render | null> {
    const row = this.db
      .prepare<{ projectId: string }, RenderRow>(
        "SELECT * FROM renders WHERE project_id = @projectId",
      )
      .get({ projectId }) as RenderRow | undefined;

    if (!row) return null;

    return Render.restore({
      projectId: row.project_id,
      outputPath: row.output_path,
      appliedCorrections: JSON.parse(row.applied_corrections) as string[],
      createdAt: new Date(row.created_at),
    });
  }
}
