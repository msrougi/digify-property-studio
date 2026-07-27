import type { DetectedObject } from "../entities/DetectedObject.js";

export interface ObjectRepository {
  saveMany(objects: DetectedObject[]): Promise<void>;
  findByScene(sceneId: string): Promise<DetectedObject[]>;
}
