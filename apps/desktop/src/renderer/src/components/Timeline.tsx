import { formatClock } from "../format.js";

interface TimelineProps {
  scenes: SceneDTO[];
}

/**
 * Timeline mínima — lista as cenas detectadas por `scene.detect`. Visualização
 * proporcional/zoom fica para uma próxima etapa (docs/reference/original-docs/16 -
 * Design System.md, "Timeline"); aqui o objetivo é mostrar dado real, não maquete.
 */
export function Timeline({ scenes }: TimelineProps): JSX.Element {
  if (scenes.length === 0) {
    return <p className="empty-state">Nenhuma cena detectada ainda.</p>;
  }

  return (
    <div className="timeline">
      {scenes.map((scene, index) => (
        <div className="timeline__scene" key={scene.id}>
          <span className="timeline__scene-label">Cena {index + 1}</span>
          <span className="timeline__scene-time">
            {formatClock(scene.startMs)} – {formatClock(scene.endMs)}
          </span>
          <span className="timeline__scene-room">{scene.roomType ?? "ambiente não identificado"}</span>
        </div>
      ))}
    </div>
  );
}
