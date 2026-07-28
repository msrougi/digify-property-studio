import { useState } from "react";

interface ImportPanelProps {
  onImported: () => void;
}

/**
 * "Máximo de um clique" — docs/reference/original-docs/06 - User Journeys.md,
 * Jornada 1 (Primeiro Contato). Sem configuração prévia obrigatória.
 */
export function ImportPanel({ onImported }: ImportPanelProps): JSX.Element {
  const [status, setStatus] = useState<"idle" | "importing" | "error">("idle");

  async function handleImportClick(): Promise<void> {
    const filePath = await window.digify.selectVideoFile();
    if (!filePath) return;

    setStatus("importing");
    try {
      await window.digify.importVideo(filePath);
      onImported();
      setStatus("idle");
    } catch {
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
      {status === "error" && (
        <p style={{ color: "#ff6b6b", marginTop: 12 }}>
          Não conseguimos importar este vídeo. Verifique se o arquivo está íntegro ou tente
          outro formato.
        </p>
      )}
    </div>
  );
}
