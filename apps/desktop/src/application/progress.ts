/**
 * Progresso real de uma operação de múltiplas etapas (Import+Análise,
 * Render). `percent` é granular (0–100) só na etapa que sabe medir
 * sub-progresso de verdade (encode via FFmpeg); nas demais, 0 ao começar e
 * 100 ao terminar a etapa — sempre um evento real, nunca uma animação
 * simulada no tempo.
 */
export interface StageProgress {
  stage: string;
  stageIndex: number;
  totalStages: number;
  percent: number;
}

export type OnStageProgress = (progress: StageProgress) => void;
