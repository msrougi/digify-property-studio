import { useCallback, useEffect, useState } from "react";
import { ImportPanel } from "./components/ImportPanel.js";
import { ProjectList } from "./components/ProjectList.js";

export function App(): JSX.Element {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);

  const refreshProjects = useCallback(async () => {
    const list = await window.digify.listProjects();
    setProjects(list);
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Digify Property Studio</h1>
        <p>Grave. Importe. A plataforma cuida do resto.</p>
      </header>

      <ImportPanel onImported={refreshProjects} />

      <section>
        <ProjectList projects={projects} />
      </section>
    </div>
  );
}
