const STATUS_LABEL: Record<string, string> = {
  importing: "Importando",
  analyzing: "Analisando",
  ready_for_review: "Pronto para revisão",
  rendering: "Renderizando",
  exported: "Exportado",
  error: "Erro",
};

interface ProjectListProps {
  projects: ProjectDTO[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}

export function ProjectList({ projects, selectedProjectId, onSelect }: ProjectListProps): JSX.Element {
  if (projects.length === 0) {
    return <p className="empty-state">Nenhum projeto ainda. Importe um vídeo para começar.</p>;
  }

  return (
    <div className="project-list">
      {projects.map((project) => (
        <button
          type="button"
          className={`project-card ${project.id === selectedProjectId ? "project-card--selected" : ""}`}
          key={project.id}
          onClick={() => onSelect(project.id)}
        >
          <span className="project-card__name">{project.name}</span>
          <span className="project-card__status">
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
        </button>
      ))}
    </div>
  );
}
