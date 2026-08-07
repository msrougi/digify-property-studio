export interface Caption {
  text: string;
  startSec: number;
  endSec: number;
}

/**
 * Escapa o que quebraria o formato ASS.
 *
 * `{` e `}` delimitam tags de override no ASS — um preço escrito "{R$ 500}"
 * sumiria da tela sem erro nenhum. `\` idem. Quebra de linha vira `\N`, a
 * quebra explícita do formato.
 */
function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N")
    .trim();
}

/** ASS conta em centésimos de segundo, com hora sempre presente: `H:MM:SS.cc`. */
function toAssTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.round((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(
    centis,
  ).padStart(2, "0")}`;
}

export interface SubtitleStyle {
  /** Resolução de referência — precisa bater com a do vídeo, senão o texto sai fora de escala. */
  width: number;
  height: number;
  fontName?: string;
  /** Proporção da altura do vídeo. Mantém o texto legível em qualquer formato (feed, story). */
  fontScale?: number;
}

const DEFAULT_FONT = "DejaVu Sans";
const DEFAULT_FONT_SCALE = 0.055;

/**
 * Monta uma legenda ASS real.
 *
 * Por que ASS e não `drawtext`: o FFmpeg embarcado (`ffmpeg-static`) **não
 * traz o filtro `drawtext`** — verificado, ele simplesmente não existe nesta
 * compilação. O que existe é `subtitles`, com libass, que ainda por cima
 * rende melhor: contorno, sombra, quebra de linha e acentuação sem
 * configuração extra.
 *
 * O estilo é calculado a partir da altura do vídeo (não em pixels fixos)
 * porque o mesmo texto precisa ficar legível tanto num 1920x1080 de feed
 * quanto num 1080x1920 de story.
 */
export function buildAssSubtitles(captions: Caption[], style: SubtitleStyle): string {
  const fontSize = Math.round(style.height * (style.fontScale ?? DEFAULT_FONT_SCALE));
  const marginV = Math.round(style.height * 0.08);
  const outline = Math.max(2, Math.round(fontSize * 0.08));

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    `PlayResX: ${style.width}`,
    `PlayResY: ${style.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
    // BorderStyle 1 + contorno preto: legível sobre foto clara ou escura sem
    // precisar de tarja. Alignment 2 = base centralizada.
    `Style: Digify,${style.fontName ?? DEFAULT_FONT},${fontSize},&H00FFFFFF,&H00000000,&H64000000,1,1,${outline},2,2,${Math.round(style.width * 0.06)},${Math.round(style.width * 0.06)},${marginV}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = captions
    .filter((caption) => caption.text.trim().length > 0 && caption.endSec > caption.startSec)
    .map(
      (caption) =>
        `Dialogue: 0,${toAssTime(caption.startSec)},${toAssTime(caption.endSec)},Digify,,0,0,0,,${escapeAssText(caption.text)}`,
    );

  return [...header, ...events].join("\n") + "\n";
}
