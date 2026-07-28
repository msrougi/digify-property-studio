interface VideoPlayerProps {
  filePath: string;
  label: string;
}

/**
 * Player real — reproduz um vídeo local via o esquema customizado
 * `digify-media://` (apps/desktop/src/shared/media.ts), sem o renderer nunca
 * tocar em `fs` diretamente (Least Privilege, docs/reference/original-docs/18
 * - Security Architecture.md).
 */
export function VideoPlayer({ filePath, label }: VideoPlayerProps): JSX.Element {
  return (
    <div className="video-player">
      <p className="video-player__label">{label}</p>
      <video
        className="video-player__el"
        src={window.digify.toMediaUrl(filePath)}
        controls
        preload="metadata"
      />
    </div>
  );
}
