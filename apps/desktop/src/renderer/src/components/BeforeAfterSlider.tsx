import { useEffect, useRef, useState } from "react";

interface BeforeAfterSliderProps {
  beforePath: string;
  afterPath: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/**
 * Comparação antes/depois com dois vídeos reais: o "depois" (renderizado)
 * ocupa o quadro inteiro, o "antes" (original) fica por cima recortado na
 * fração esquerda controlada pelo divisor arrastável.
 *
 * Os controles de reprodução são NOSSOS, não os nativos do `<video>`. Isso
 * é deliberado: os controles nativos vivem no shadow DOM do elemento e
 * ficavam embaixo da camada de sobreposição da comparação (o input do
 * divisor + o vídeo "antes" recortado), então clicar em play simplesmente
 * não fazia nada — bug real reportado por um usuário. Controles próprios,
 * renderizados FORA da área de sobreposição, eliminam essa classe inteira
 * de problema e ainda são testáveis de verdade (botão com nome acessível,
 * em vez de coordenada chutada em cima de shadow DOM).
 */
export function BeforeAfterSlider({ beforePath, afterPath }: BeforeAfterSliderProps): JSX.Element {
  const [splitPercent, setSplitPercent] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const beforeVideoRef = useRef<HTMLVideoElement>(null);
  const afterVideoRef = useRef<HTMLVideoElement>(null);

  // Mantém o "antes" alinhado com o "depois" (que é quem os controles
  // comandam) — sem isso os dois lados mostrariam instantes diferentes,
  // tornando a comparação enganosa.
  function syncBefore(): void {
    const after = afterVideoRef.current;
    const before = beforeVideoRef.current;
    if (!after || !before) return;
    if (Math.abs(before.currentTime - after.currentTime) > 0.15) {
      before.currentTime = after.currentTime;
    }
  }

  useEffect(() => {
    const before = beforeVideoRef.current;
    if (!before) return;
    if (isPlaying) void before.play().catch(() => undefined);
    else before.pause();
  }, [isPlaying]);

  async function togglePlay(): Promise<void> {
    const after = afterVideoRef.current;
    if (!after) return;
    if (after.paused) await after.play().catch(() => undefined);
    else after.pause();
  }

  function seekTo(seconds: number): void {
    const after = afterVideoRef.current;
    const before = beforeVideoRef.current;
    if (after) after.currentTime = seconds;
    if (before) before.currentTime = seconds;
    setCurrentTime(seconds);
  }

  return (
    <div className="before-after">
      <p className="before-after__label">Antes / Depois</p>

      <div className="before-after__stage">
        <video
          ref={afterVideoRef}
          className="before-after__video before-after__video--after"
          src={window.digify.toMediaUrl(afterPath)}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
            syncBefore();
          }}
          onSeeked={syncBefore}
        />

        <div className="before-after__before-clip" style={{ width: `${splitPercent}%` }}>
          <video
            ref={beforeVideoRef}
            className="before-after__video before-after__video--before"
            src={window.digify.toMediaUrl(beforePath)}
            muted
            preload="metadata"
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
        <span
          className="before-after__tag before-after__tag--before"
          style={{ opacity: splitPercent > 12 ? 1 : 0 }}
        >
          Antes
        </span>
        <span
          className="before-after__tag before-after__tag--after"
          style={{ opacity: splitPercent < 88 ? 1 : 0 }}
        >
          Depois
        </span>
      </div>

      <div className="before-after__controls">
        <button
          type="button"
          className="before-after__play"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproduzir"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          className="before-after__seek"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={(event) => seekTo(Number(event.target.value))}
          aria-label="Posição do vídeo"
        />
        <span className="before-after__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
