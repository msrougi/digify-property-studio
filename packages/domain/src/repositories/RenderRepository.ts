import type { Render } from "../entities/Render.js";

export interface RenderRepository {
  save(render: Render): Promise<void>;
  findByProject(projectId: string): Promise<Render | null>;
}
