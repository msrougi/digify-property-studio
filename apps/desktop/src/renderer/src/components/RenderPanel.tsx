import { useEffect, useState } from "react";
import { ProgressBar } from "./ProgressBar.js";
import { BeforeAfterSlider } from "./BeforeAfterSlider.js";
import { useElapsedTime } from "../useElapsedTime.js";

interface RenderPanelProps {
  projectId: string;
  projectName: string;
  sourceVideoPath: string;
}

const PROFILE_LABEL: Record<ColorProfile, string> = {
  warm: "Warm",
  minimal: "Minimal",
  luxury: "Luxury",
  modern: "Modern",
  industrial: "Industrial",
  beach: "Beach",
  scandinavian: "Scandinavian",
  corporate: "Corporate",
};

const ORIGINAL_FORMAT_OPTION = "";

/**
 * "Aplicar melhorias" — Lighting + Color reais via PIE™ + Rendering Engine.
 * Sempre informa o que foi alterado (docs/reference/original-docs/05 - User
 * Experience (UX).md, "Confiança"). Depois do render, o usuário assiste o
 * resultado (Player real) e pode exportar para onde quiser, no formato
 * original ou num preset real de rede social (`docs/00-ARCHITECTURE.md`,
 * seção 11).
 */
export function RenderPanel({ projectId, projectName, sourceVideoPath }: RenderPanelProps): JSX.Element {
  const [profile, setProfile] = useState<ColorProfile>("warm");
  const [applySharpen, setApplySharpen] = useState(false);
  const [applyHomeStaging, setApplyHomeStaging] = useState(false);
  const [applyPerspective, setApplyPerspective] = useState(false);
  const [applyReflection, setApplyReflection] = useState(false);
  const [status, setStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [progress, setProgress] = useState<StageProgressDTO | null>(null);
  const elapsedMs = useElapsedTime(status === "rendering");
  const [result, setResult] = useState<RenderPreviewDTO | null>(null);
  const [exportPresets, setExportPresets] = useState<ExportPresetDTO[]>([]);
  const [exportPresetId, setExportPresetId] = useState<string>(ORIGINAL_FORMAT_OPTION);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "done" | "error">(
    "idle",
  );
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  useEffect(() => {
    void window.digify.getExportPresets().then(setExportPresets);
  }, []);

  // Recarrega o render já feito antes (persistido no banco) ao abrir ou
  // trocar de projeto — sem isso, o resultado só existia no estado desta
  // tela: quem importava, revisava e saía perdia a comparação
  // antes/depois pra sempre, mesmo com o vídeo ainda no disco.
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setStatus("idle");
    setProgress(null);
    setExportStatus("idle");
    setExportedPath(null);

    void window.digify.getRender(projectId).then((saved) => {
      if (cancelled || !saved) return;
      setResult({ outputPath: saved.outputPath, appliedCorrections: saved.appliedCorrections });
      setStatus("done");
    });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleRender(): Promise<void> {
    setStatus("rendering");
    setProgress(null);
    setExportStatus("idle");
    setExportedPath(null);
    try {
      const renderResult = await window.digify.renderPreview(
        {
          projectId,
          colorProfile: profile,
          applySharpen,
          applyHomeStaging,
          applyPerspective,
          applyReflection,
        },
        setProgress,
      );
      setResult(renderResult);
      setStatus("done");
    } catch (error) {
      console.error(error);
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
        exportPresetId || undefined,
      );
      setExportedPath(exportResult.destinationPath);
      setExportStatus("done");
    } catch (error) {
      console.error(error);
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
          Remover itens temporários
        </label>
        <label className="render-panel__checkbox">
          <input
            type="checkbox"
            checked={applyPerspective}
            onChange={(event) => setApplyPerspective(event.target.checked)}
            disabled={status === "rendering"}
          />
          Nivelar horizonte
        </label>
        <label className="render-panel__checkbox">
          <input
            type="checkbox"
            checked={applyReflection}
            onChange={(event) => setApplyReflection(event.target.checked)}
            disabled={status === "rendering"}
          />
          Reduzir reflexo/brilho difuso
        </label>
        <button className="button-primary" onClick={handleRender} disabled={status === "rendering"}>
          {status === "rendering" ? "Aplicando…" : "Aplicar melhorias"}
        </button>
      </div>

      {status === "rendering" && progress && (
        <ProgressBar
          stage={progress.stage}
          stageIndex={progress.stageIndex}
          totalStages={progress.totalStages}
          percent={progress.percent}
          elapsedMs={elapsedMs}
        />
      )}

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

          <BeforeAfterSlider beforePath={sourceVideoPath} afterPath={result.outputPath} />

          <div className="render-panel__export">
            <select
              className="select"
              value={exportPresetId}
              onChange={(event) => setExportPresetId(event.target.value)}
              disabled={exportStatus === "exporting"}
            >
              <option value={ORIGINAL_FORMAT_OPTION}>Formato original</option>
              {exportPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} — {preset.width}x{preset.height}
                </option>
              ))}
            </select>
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
