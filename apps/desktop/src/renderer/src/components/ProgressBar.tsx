interface ProgressBarProps {
  stage: string;
  stageIndex: number;
  totalStages: number;
  /** % real dentro da etapa atual (0–100) — nunca uma animação simulada. */
  percent: number;
  elapsedMs: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Progresso real: `percent` vem do próprio FFmpeg (`RenderingEngine`) ou de
 * transições reais de etapa (`StageProgress`) — nunca uma barra animada no
 * tempo sem relação com o trabalho de verdade sendo feito.
 */
export function ProgressBar({
  stage,
  stageIndex,
  totalStages,
  percent,
  elapsedMs,
}: ProgressBarProps): JSX.Element {
  // % geral: etapas já concluídas + fração da etapa atual, sobre o total de etapas.
  const overallPercent = Math.min(
    100,
    (((stageIndex - 1) + percent / 100) / totalStages) * 100,
  );

  return (
    <div className="progress-bar">
      <div className="progress-bar__track">
        <div className="progress-bar__fill" style={{ width: `${overallPercent}%` }} />
      </div>
      <div className="progress-bar__meta">
        <span className="progress-bar__stage">
          {stage} ({stageIndex}/{totalStages})
        </span>
        <span className="progress-bar__stats">
          {Math.round(overallPercent)}% · {formatElapsed(elapsedMs)}
        </span>
      </div>
    </div>
  );
}
