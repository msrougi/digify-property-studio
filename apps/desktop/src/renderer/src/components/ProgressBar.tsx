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

/** Amostra pequena demais projeta besteira ("restam 4:31:07" no primeiro segundo). */
const MIN_ELAPSED_FOR_ESTIMATE_MS = 5000;
const MIN_PERCENT_FOR_ESTIMATE = 3;

/**
 * Estimativa do tempo restante a partir do ritmo REAL medido até agora
 * (regra de três sobre o progresso já observado) — não é um contador
 * inventado. Devolve null enquanto não há amostra suficiente pra projetar.
 *
 * Existe porque a limpeza de bagunça quadro a quadro leva minutos (~16 min
 * num vídeo de 1min30): sem uma previsão, uma barra que anda devagar é
 * indistinguível de um app travado.
 */
function estimateRemaining(elapsedMs: number, overallPercent: number): string | null {
  if (elapsedMs < MIN_ELAPSED_FOR_ESTIMATE_MS || overallPercent < MIN_PERCENT_FOR_ESTIMATE) {
    return null;
  }
  const totalMs = (elapsedMs / overallPercent) * 100;
  return formatElapsed(Math.max(0, totalMs - elapsedMs));
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
  const remaining = estimateRemaining(elapsedMs, overallPercent);

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
          {remaining !== null ? ` · restam ~${remaining}` : ""}
        </span>
      </div>
    </div>
  );
}
