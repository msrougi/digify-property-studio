import { useState } from "react";
import { VideoPlayer } from "./VideoPlayer.js";

interface RenderPanelProps {
  projectId: string;
  projectName: string;
}

const PROFILE_LABEL: Record<ColorProfile, string> = {
  warm: "Warm",
  minimal: "Minimal",
  luxury: "Luxury",
};

/**
 * "Aplicar melhorias" — Lighting + Color reais via PIE™ + Rendering Engine.
 * Sempre informa o que foi alterado (docs/reference/original-docs/05 - User
 * Experience (UX).md, "Confiança"). Depois do render, o usuário assiste o
 * resultado (Player real) e pode exportar para onde quiser (Export Manager
 * real — cópia de verdade, `docs/00-ARCHITECTURE.md`, seção 11).
 */
export function RenderPanel({ projectId, projectName }: RenderPanelProps): JSX.Element {
  const [profile, setProfile] = useState<ColorProfile>("warm");
  const [applySharpen, setApplySharpen] = useState(false);
  const [applyHomeStaging, setApplyHomeStaging] = useState(false);
  const [status, setStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [result, setResult] = useState<RenderPreviewDTO | null>(null);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "done" | "error">(
    "idle",
  );
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  async function handleRender(): Promise<void> {
    setStatus("rendering");
    setExportStatus("idle");
    setExportedPath(null);
    try {
      const renderResult = await window.digify.renderPreview({
        projectId,
        colorProfile: profile,
        applySharpen,
        applyHomeStaging,
      });
      setResult(renderResult);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  async function handleExport(): Promise<void> {
    if (!result) return;
    const suggestedName = `${projectName}.mp4`;
    const destinationPath = await window.digify.selectExportDestination(suggestedName);
    if (!destinationPath) return;

    setExportStatus("exporting");
    try {
      const exportResult = await window.digify.exportVideo(
        projectId,
        result.outputPath,
        destinationPath,
      );
      setExportedPath(exportResult.destinationPath);
      setExportStatus("done");
    } catch {
      setExportStatus("error");
    }
  }

  return (
    <div className="render-panel">
      <div className="render-panel__controls">
        <select
          className="select"
          value={profile}
          onChange={(event) => setProfile(event.target.value as ColorProfile)}
          disabled={status === "rendering"}
        >
          {(Object.keys(PROFILE_LABEL) as ColorProfile[]).map((key) => (
            <option key={key} value={key}>
              {PROFILE_LABEL[key]}
            </option>
          ))}
        </select>
        <label className="render-panel__checkbox">
          <input
            type="checkbox"
            checked={applySharpen}
            onChange={(event) => setApplySharpen(event.target.checked)}
            disabled={status === "rendering"}
          />
          Nitidez
        </label>
        <label className="render-panel__checkbox">
          <input
            type="checkbox"
            checked={applyHomeStaging}
            onChange={(event) => setApplyHomeStaging(event.target.checked)}
            disabled={status === "rendering"}
          />
          Remover itens temporários (experimental)
        </label>
        <button className="button-primary" onClick={handleRender} disabled={status === "rendering"}>
          {status === "rendering" ? "Aplicando…" : "Aplicar melhorias"}
        </button>
      </div>

      {status === "error" && (
        <p style={{ color: "#ff6b6b" }}>Não conseguimos aplicar as melhorias neste vídeo.</p>
      )}

      {status === "done" && result && (
        <div className="render-panel__result">
          <p className="render-panel__result-title">O que foi alterado:</p>
          <ul>
            {result.appliedCorrections.map((correction) => (
              <li key={correction}>{correction}</li>
            ))}
          </ul>

          <VideoPlayer filePath={result.outputPath} label="Prévia renderizada" />

          <div className="render-panel__export">
            <button
              className="button-primary"
              onClick={handleExport}
              disabled={exportStatus === "exporting"}
            >
              {exportStatus === "exporting" ? "Exportando…" : "Exportar vídeo final"}
            </button>
            {exportStatus === "error" && (
              <p style={{ color: "#ff6b6b" }}>Não conseguimos exportar o vídeo para esse destino.</p>
            )}
            {exportStatus === "done" && exportedPath && (
              <p className="render-panel__result-path">Exportado para: {exportedPath}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
