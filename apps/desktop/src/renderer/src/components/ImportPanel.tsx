import { useState } from "react";
import { ProgressBar } from "./ProgressBar.js";
import { useElapsedTime } from "../useElapsedTime.js";

interface ImportPanelProps {
  onImported: () => void;
}

/**
 * "Máximo de um clique" — docs/reference/original-docs/06 - User Journeys.md,
 * Jornada 1 (Primeiro Contato). Sem configuração prévia obrigatória.
 */
export function ImportPanel({ onImported }: ImportPanelProps): JSX.Element {
  const [status, setStatus] = useState<"idle" | "importing" | "error">("idle");
  const [progress, setProgress] = useState<StageProgressDTO | null>(null);
  const elapsedMs = useElapsedTime(status === "importing");

  async function handleImportClick(): Promise<void> {
    const filePath = await window.digify.selectVideoFile();
    if (!filePath) return;

    setStatus("importing");
    setProgress(null);
    try {
      await window.digify.importVideo(filePath, setProgress);
      onImported();
      setStatus("idle");
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }

  return (
    <div className="import-panel">
      <button
        className="button-primary"
        onClick={handleImportClick}
        disabled={status === "importing"}
      >
        {status === "importing" ? "Importando…" : "Importar vídeo"}
      </button>
      {status === "importing" && progress && (
        <ProgressBar
          stage={progress.stage}
          stageIndex={progress.stageIndex}
          totalStages={progress.totalStages}
          percent={progress.percent}
          elapsedMs={elapsedMs}
        />
      )}
      {status === "error" && (
        <p style={{ color: "#ff6b6b", marginTop: 12 }}>
          Não conseguimos importar este vídeo. Verifique se o arquivo está íntegro ou tente
          outro formato.
        </p>
      )}
    </div>
  );
}
