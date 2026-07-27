import type Database from "better-sqlite3";
import { Scene, type SceneRepository, type RoomType } from "@digify/domain";

interface SceneRow {
  id: string;
  project_id: string;
  start_ms: number;
  end_ms: number;
  room_type: RoomType | null;
  room_confidence: number | null;
}

export class SqliteSceneRepository implements SceneRepository {
  constructor(private readonly db: Database.Database) {}

  async saveMany(scenes: Scene[]): Promise<void> {
    const insert = this.db.prepare(
      `INSERT INTO scenes (id, project_id, start_ms, end_ms, room_type, room_confidence)
       VALUES (@id, @projectId, @startMs, @endMs, @roomType, @roomConfidence)
       ON CONFLICT(id) DO UPDATE SET
         room_type = excluded.room_type,
         room_confidence = excluded.room_confidence`,
    );

    const transaction = this.db.transaction((items: Scene[]) => {
      for (const scene of items) {
        const props = scene.toProps();
        insert.run({
          id: props.id,
          projectId: props.projectId,
          startMs: props.startMs,
          endMs: props.endMs,
          roomType: props.roomType,
          roomConfidence: props.roomConfidence,
        });
      }
    });

    transaction(scenes);
  }

  async findByProject(projectId: string): Promise<Scene[]> {
    const rows = this.db
      .prepare<{ projectId: string }, SceneRow>(
        "SELECT * FROM scenes WHERE project_id = @projectId ORDER BY start_ms ASC",
      )
      .all({ projectId }) as SceneRow[];

    return rows.map((row) =>
      Scene.restore({
        id: row.id,
        projectId: row.project_id,
        startMs: row.start_ms,
        endMs: row.end_ms,
        roomType: row.room_type,
        roomConfidence: row.room_confidence,
      }),
    );
  }
}
