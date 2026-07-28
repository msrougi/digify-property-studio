import { useCallback, useEffect, useState } from "react";
import { ImportPanel } from "./components/ImportPanel.js";
import { ProjectList } from "./components/ProjectList.js";
import { Timeline } from "./components/Timeline.js";
import { RenderPanel } from "./components/RenderPanel.js";
import { PropertyScorePanel } from "./components/PropertyScorePanel.js";

export function App(): JSX.Element {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<SceneDTO[]>([]);
  const [objects, setObjects] = useState<DetectedObjectDTO[]>([]);
  const [propertyScore, setPropertyScore] = useState<PropertyScoreDTO | null>(null);

  const refreshProjects = useCallback(async (): Promise<string | undefined> => {
    const list = await window.digify.listProjects();
    setProjects(list);
    return list[0]?.id;
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setScenes([]);
      setObjects([]);
      setPropertyScore(null);
      return;
    }
    void window.digify.getScenes(selectedProjectId).then(setScenes);
    void window.digify.getObjects(selectedProjectId).then(setObjects);
    void window.digify.getPropertyScore(selectedProjectId).then(setPropertyScore);
  }, [selectedProjectId]);

  async function handleImported(): Promise<void> {
    const firstProjectId = await refreshProjects();
    if (firstProjectId && !selectedProjectId) {
      setSelectedProjectId(firstProjectId);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Digify Property Studio</h1>
        <p>Grave. Importe. A plataforma cuida do resto.</p>
      </header>

      <ImportPanel onImported={handleImported} />

      <section>
        <ProjectList
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />
      </section>

      {selectedProjectId && (
        <section>
          <h2 className="section-title">Timeline</h2>
          <Timeline scenes={scenes} />
        </section>
      )}

      {selectedProjectId && (
        <section>
          <h2 className="section-title">Property Score</h2>
          <PropertyScorePanel score={propertyScore} objects={objects} />
        </section>
      )}

      {selectedProjectId && (
        <section>
          <h2 className="section-title">Melhorias</h2>
          <RenderPanel projectId={selectedProjectId} />
        </section>
      )}
    </div>
  );
}
