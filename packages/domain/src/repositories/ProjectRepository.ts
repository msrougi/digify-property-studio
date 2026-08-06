import type { Project } from "../entities/Project.js";

export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;
  list(): Promise<Project[]>;
  /** Apaga TODOS os projetos (cascata leva cenas, objetos e renders junto). O app trabalha com um vídeo por vez. */
  deleteAll(): Promise<void>;
}
