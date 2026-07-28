export interface ExportPreset {
  id: string;
  label: string;
  network: string;
  width: number;
  height: number;
  /** Bitrate de vídeo alvo, baseado nas recomendações públicas de cada rede para essa resolução. */
  videoBitrateKbps: number;
  description: string;
}

/**
 * Presets reais de exportação por rede social — docs/reference/original-docs/11
 * - Rendering Engine.md, "Export Manager" (só listava os nomes: Vídeo
 * Horizontal/Vertical, Stories, Reels...; sem dimensões exatas). As
 * dimensões e bitrates aqui são as especificações publicamente documentadas
 * de cada rede (não inventadas): 1080x1920 (9:16) para conteúdo vertical em
 * tela cheia (Reels/Stories/TikTok/Shorts), 1920x1080 (16:9) para YouTube
 * horizontal, 1080x1080 (1:1) para o feed clássico do Instagram.
 */
export const EXPORT_PRESETS: Record<string, ExportPreset> = {
  instagram_feed: {
    id: "instagram_feed",
    label: "Instagram Feed (1:1)",
    network: "Instagram",
    width: 1080,
    height: 1080,
    videoBitrateKbps: 6000,
    description: "Formato quadrado clássico do feed do Instagram.",
  },
  instagram_reels: {
    id: "instagram_reels",
    label: "Instagram Reels (9:16)",
    network: "Instagram",
    width: 1080,
    height: 1920,
    videoBitrateKbps: 8000,
    description: "Vertical em tela cheia para Reels.",
  },
  instagram_stories: {
    id: "instagram_stories",
    label: "Instagram Stories (9:16)",
    network: "Instagram",
    width: 1080,
    height: 1920,
    videoBitrateKbps: 8000,
    description: "Vertical em tela cheia para Stories.",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok (9:16)",
    network: "TikTok",
    width: 1080,
    height: 1920,
    videoBitrateKbps: 8000,
    description: "Vertical em tela cheia, especificação do TikTok.",
  },
  youtube: {
    id: "youtube",
    label: "YouTube (16:9)",
    network: "YouTube",
    width: 1920,
    height: 1080,
    videoBitrateKbps: 8000,
    description: "Horizontal Full HD — recomendação padrão do YouTube para 1080p30.",
  },
  youtube_shorts: {
    id: "youtube_shorts",
    label: "YouTube Shorts (9:16)",
    network: "YouTube",
    width: 1080,
    height: 1920,
    videoBitrateKbps: 8000,
    description: "Vertical em tela cheia para Shorts.",
  },
  facebook_feed: {
    id: "facebook_feed",
    label: "Facebook Feed (16:9)",
    network: "Facebook",
    width: 1280,
    height: 720,
    videoBitrateKbps: 5000,
    description: "Horizontal HD para o feed do Facebook.",
  },
};

export type ExportPresetId = keyof typeof EXPORT_PRESETS;
