import type { Scene } from "../entities/Scene.js";

export interface SceneRepository {
  saveMany(scenes: Scene[]): Promise<void>;
  findByProject(projectId: string): Promise<Scene[]>;
}
