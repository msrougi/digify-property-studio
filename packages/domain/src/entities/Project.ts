export type ProjectStatus =
  | "importing"
  | "analyzing"
  | "ready_for_review"
  | "rendering"
  | "exported"
  | "error";

export interface ProjectProps {
  id: string;
  name: string;
  sourceVideoPath: string;
  sourceVideoHash: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Raiz de agregado do projeto. Nunca contém bytes de vídeo — apenas o caminho no
 * sistema de arquivos (docs/00-ARCHITECTURE.md, seção 9).
 */
export class Project {
  private constructor(private props: ProjectProps) {}

  static create(input: {
    id: string;
    name: string;
    sourceVideoPath: string;
    sourceVideoHash: string;
    now?: Date;
  }): Project {
    const now = input.now ?? new Date();
    return new Project({
      id: input.id,
      name: input.name,
      sourceVideoPath: input.sourceVideoPath,
      sourceVideoHash: input.sourceVideoHash,
      status: "importing",
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: ProjectProps): Project {
    return new Project(props);
  }

  transitionTo(status: ProjectStatus, now: Date = new Date()): void {
    this.props.status = status;
    this.props.updatedAt = now;
  }

  toProps(): Readonly<ProjectProps> {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get status(): ProjectStatus {
    return this.props.status;
  }
}
