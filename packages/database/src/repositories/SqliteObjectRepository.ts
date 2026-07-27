import type Database from "better-sqlite3";
import { DetectedObject, type ObjectRepository, type ObjectCategory } from "@digify/domain";

interface ObjectRow {
  id: string;
  scene_id: string;
  category: ObjectCategory;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  confidence: number;
  removable: number;
}

export class SqliteObjectRepository implements ObjectRepository {
  constructor(private readonly db: Database.Database) {}

  async saveMany(objects: DetectedObject[]): Promise<void> {
    const insert = this.db.prepare(
      `INSERT INTO objects (id, scene_id, category, bbox_x, bbox_y, bbox_width, bbox_height, confidence, removable)
       VALUES (@id, @sceneId, @category, @bboxX, @bboxY, @bboxWidth, @bboxHeight, @confidence, @removable)
       ON CONFLICT(id) DO NOTHING`,
    );

    const transaction = this.db.transaction((items: DetectedObject[]) => {
      for (const object of items) {
        const props = object.toProps();
        insert.run({
          id: props.id,
          sceneId: props.sceneId,
          category: props.category,
          bboxX: props.boundingBox.x,
          bboxY: props.boundingBox.y,
          bboxWidth: props.boundingBox.width,
          bboxHeight: props.boundingBox.height,
          confidence: props.confidence,
          removable: props.removable ? 1 : 0,
        });
      }
    });

    transaction(objects);
  }

  async findByScene(sceneId: string): Promise<DetectedObject[]> {
    const rows = this.db
      .prepare<{ sceneId: string }, ObjectRow>("SELECT * FROM objects WHERE scene_id = @sceneId")
      .all({ sceneId }) as ObjectRow[];

    return rows.map((row) =>
      DetectedObject.restore({
        id: row.id,
        sceneId: row.scene_id,
        category: row.category,
        boundingBox: {
          x: row.bbox_x,
          y: row.bbox_y,
          width: row.bbox_width,
          height: row.bbox_height,
        },
        confidence: row.confidence,
        removable: row.removable === 1,
      }),
    );
  }
}
