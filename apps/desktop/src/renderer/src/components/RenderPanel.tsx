import { useState } from "react";

interface RenderPanelProps {
  projectId: string;
}

const PROFILE_LABEL: Record<ColorProfile, string> = {
  warm: "Warm",
  minimal: "Minimal",
  luxury: "Luxury",
};

/**
 * "Aplicar melhorias" — Lighting + Color reais via PIE™ + Rendering Engine.
 * Sempre informa o que foi alterado (docs/reference/original-docs/05 - User
 * Experience (UX).md, "Confiança").
 */
export function RenderPanel({ projectId }: RenderPanelProps): JSX.Element {
  const [profile, setProfile] = useState<ColorProfile>("warm");
  const [applySharpen, setApplySharpen] = useState(false);
  const [applyHomeStaging, setApplyHomeStaging] = useState(false);
  const [status, setStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [result, setResult] = useState<RenderPreviewDTO | null>(null);

  async function handleRender(): Promise<void> {
    setStatus("rendering");
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
          <p className="render-panel__result-path">{result.outputPath}</p>
        </div>
      )}
    </div>
  );
}
