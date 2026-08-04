import { useRef, useState } from "react";

interface BeforeAfterSliderProps {
  beforePath: string;
  afterPath: string;
}

/**
 * Comparação antes/depois com dois vídeos reais (não uma imagem estática):
 * o vídeo "depois" (renderizado) fica embaixo em tela cheia, o "antes"
 * (original) fica em cima, revelado só na fração esquerda controlada pelo
 * slider — arrastar troca em tempo real qual lado aparece. Reprodução
 * sincronizada entre os dois (o "antes" espelha play/pause/seek do
 * "depois", que tem os controles nativos) — assim o usuário assiste os
 * dois vídeos reais lado a lado no tempo, não só um frame parado.
 */
export function BeforeAfterSlider({ beforePath, afterPath }: BeforeAfterSliderProps): JSX.Element {
  const [splitPercent, setSplitPercent] = useState(50);
  const beforeVideoRef = useRef<HTMLVideoElement>(null);
  const afterVideoRef = useRef<HTMLVideoElement>(null);

  function syncBeforeToAfter(): void {
    const after = afterVideoRef.current;
    const before = beforeVideoRef.current;
    if (!after || !before) return;
    if (Math.abs(before.currentTime - after.currentTime) > 0.1) {
      before.currentTime = after.currentTime;
    }
    if (after.paused && !before.paused) before.pause();
    if (!after.paused && before.paused) void before.play();
  }

  return (
    <div className="before-after">
      <p className="before-after__label">Antes / Depois</p>
      <div className="before-after__stage">
        <video
          ref={afterVideoRef}
          className="before-after__video before-after__video--after"
          src={window.digify.toMediaUrl(afterPath)}
          controls
          preload="metadata"
          onPlay={syncBeforeToAfter}
          onPause={syncBeforeToAfter}
          onSeeked={syncBeforeToAfter}
          onTimeUpdate={syncBeforeToAfter}
        />
        <div className="before-after__before-clip" style={{ width: `${splitPercent}%` }}>
          <video
            ref={beforeVideoRef}
            className="before-after__video before-after__video--before"
            src={window.digify.toMediaUrl(beforePath)}
            muted
            preload="metadata"
            // O clip pai só tem `splitPercent`% da largura do palco — o
            // vídeo precisa ocupar 100/splitPercent * 100% DELE pra
            // continuar batendo pixel-a-pixel com o vídeo "depois" embaixo
            // (senão a imagem ficaria espremida em vez de só cortada).
            style={{ width: splitPercent > 0 ? `${(100 / splitPercent) * 100}%` : "100%" }}
          />
        </div>
        <div className="before-after__divider" style={{ left: `${splitPercent}%` }} />
        <input
          type="range"
          className="before-after__handle"
          min={0}
          max={100}
          value={splitPercent}
          onChange={(event) => setSplitPercent(Number(event.target.value))}
          aria-label="Posição da comparação antes/depois"
        />
        <span className="before-after__tag before-after__tag--before" style={{ opacity: splitPercent > 12 ? 1 : 0 }}>
          Antes
        </span>
        <span className="before-after__tag before-after__tag--after" style={{ opacity: splitPercent < 88 ? 1 : 0 }}>
          Depois
        </span>
      </div>
    </div>
  );
}
