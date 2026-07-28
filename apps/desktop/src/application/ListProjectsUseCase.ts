import type { Project, ProjectRepository } from "@digify/domain";

export class ListProjectsUseCase {
  constructor(private readonly projectRepository: ProjectRepository) {}

  async execute(): Promise<Project[]> {
    return this.projectRepository.list();
  }
}
