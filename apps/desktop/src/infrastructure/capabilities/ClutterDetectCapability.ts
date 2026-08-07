import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractGrayscaleFrame } from "../ffmpeg/extractGrayscaleFrame.js";
import { detectClutterRegions, type ClutterRegion } from "../vision/detectClutterRegions.js";
import { overlapRatio } from "../vision/overlapRatio.js";
import type { Box } from "../vision/unionBoxWithMargin.js";

export interface ClutterDetectInput {
  filePath: string;
  sceneStartMs: number;
  sceneEndMs: number;
  frameWidth: number;
  frameHeight: number;
  /** Pessoas e móveis/eletrodomésticos fixos já detectados por `object.detect` — nunca viram candidato a remoção, não importa quão "texturizados" pareçam. */
  excludeBoxes: Box[];
}

export interface ClutterDetectResult {
  boundingBox: Box;
  confidence: number;
}

export interface ClutterDetectOutput {
  regions: ClutterDetectResult[];
}

const SAMPLES_PER_SCENE = 5;

/**
 * Limiar da detecção no caminho de RELATÓRIO. Mais frouxo que o padrão do
 * `detectClutterRegions` (5,0) porque com 5,0 os cômodos reais de exemplo
 * voltavam com 0/0/1 regiões — foi exatamente isso que produziu o
 * "100/100, nada pra tirar" num vídeo visivelmente bagunçado.
 *
 * Ainda bem mais conservador que os 2,5 da limpeza (`FrameByFrameCleaner`),
 * e por um bom motivo: aqui um falso positivo vira uma acusação errada
 * sobre o imóvel numa lista que o usuário lê, não um remendo invisível.
 */
const REPORT_ZSCORE_THRESHOLD = 3.5;

/**
 * Quantos frames distintos precisam concordar pra uma região virar relatório.
 *
 * Medido: com o limiar em 3,5, ruído puro de sensor produz 0–2 regiões
 * falsas por frame (contra 0 no limiar 5,0). Só que essas regiões caem em
 * lugares ALEATÓRIOS a cada frame, enquanto bagunça de verdade fica parada
 * no mesmo lugar. Exigir concordância entre frames separa as duas coisas
 * sem sacrificar sensibilidade — o que baixar o limiar sozinho não faria.
 */
const MIN_FRAMES_CONFIRMING = 2;

/**
 * Capability `clutter.detect` — docs/CAPABILITY_REGISTRY.md, Vision Layer.
 * Complementa `object.detect`: o YOLOX/COCO só reconhece 80 tipos
 * específicos de objeto, sem categoria nenhuma pra "monte de roupa no
 * chão"/"bagunça genérica" — a maior parte do que aparece num cômodo real
 * bagunçado. Usa `detectClutterRegions` (Sobel + estatística, ver esse
 * arquivo pro raciocínio completo) em vez de tentar reconhecer "o que é"
 * cada item.
 *
 * Roda em `SAMPLES_PER_SCENE` frames espalhados pela cena (mesmo raciocínio
 * de `object.detect`) e funde as regiões batendo por sobreposição — não
 * pontua confiança por região individual, usa `textureScore` normalizado
 * como proxy.
 */
export class ClutterDetectCapability implements Capability<ClutterDetectInput, ClutterDetectOutput> {
  readonly id = "clutter.detect";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  private sampleTimestamps(sceneStartMs: number, sceneEndMs: number): number[] {
    const durationMs = Math.max(0, sceneEndMs - sceneStartMs);
    const timestamps: number[] = [];
    for (let i = 0; i < SAMPLES_PER_SCENE; i++) {
      const fraction = (i + 1) / (SAMPLES_PER_SCENE + 1);
      timestamps.push(Math.round(sceneStartMs + fraction * durationMs));
    }
    return [...new Set(timestamps)];
  }

  async execute(input: ClutterDetectInput): Promise<CapabilityResult<ClutterDetectOutput>> {
    const timestamps = this.sampleTimestamps(input.sceneStartMs, input.sceneEndMs);

    const regionsPerFrame: ClutterRegion[][] = [];
    for (const atMs of timestamps) {
      const frame = await extractGrayscaleFrame(input.filePath, atMs, input.frameWidth, input.frameHeight);
      // `extractGrayscaleFrame` reduz a resolução (custo do algoritmo) —
      // escala as caixas de exclusão pra bater com o espaço de trabalho
      // deste frame específico.
      const scale = frame.width / input.frameWidth;
      const scaledExcludeBoxes = input.excludeBoxes.map((box) => ({
        x: box.x * scale,
        y: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
      }));

      const regions = detectClutterRegions(
        frame.buffer,
        frame.width,
        frame.height,
        scaledExcludeBoxes,
        { zScoreThreshold: REPORT_ZSCORE_THRESHOLD },
      );
      // Escala de volta pro espaço de coordenadas original do frame — o
      // resto do pipeline (overlay, delogo, persistência) trabalha nesse
      // espaço.
      regionsPerFrame.push(
        regions.map((region) => ({
          x: region.x / scale,
          y: region.y / scale,
          width: region.width / scale,
          height: region.height / scale,
          textureScore: region.textureScore,
        })),
      );
    }

    const mergedRegions = mergeOverlappingRegions(regionsPerFrame);

    const results: ClutterDetectResult[] = mergedRegions.map((region) => ({
      boundingBox: { x: region.x, y: region.y, width: region.width, height: region.height },
      // Confidence moderada de propósito — é uma heurística de textura, não
      // reconhecimento de objeto; sempre vai exigir confirmação no
      // Home Staging de qualquer forma (mesma lógica das outras capabilities
      // de Production que alteram conteúdo visível).
      confidence: 60,
    }));

    return {
      output: { regions: results },
      confidence: Confidence.of(results.length > 0 ? 60 : 100),
    };
  }
}

/**
 * Frames diferentes da mesma cena tendem a marcar a MESMA bagunça física —
 * funde regiões que se sobrepõem significativamente em vez de devolver uma
 * caixa por frame (evitaria duplicar o mesmo item várias vezes na lista de
 * objetos removíveis).
 *
 * E é aqui que a concordância entre frames vira o filtro de falso positivo:
 * uma região só sobrevive se pelo menos `MIN_FRAMES_CONFIRMING` frames
 * DISTINTOS marcaram aquele mesmo lugar. Bagunça física fica parada; ruído
 * de sensor pula de lugar a cada frame.
 */
function mergeOverlappingRegions(regionsPerFrame: ClutterRegion[][]): ClutterRegion[] {
  const withFrame = regionsPerFrame.flatMap((regions, frameIndex) =>
    regions.map((region) => ({ region, frameIndex })),
  );
  const sorted = withFrame.sort((a, b) => b.region.textureScore - a.region.textureScore);

  const clusters: { region: ClutterRegion; frames: Set<number> }[] = [];
  for (const { region, frameIndex } of sorted) {
    const existing = clusters.find((cluster) => overlapRatio(region, cluster.region) > 0.3);
    // O representante do cluster é o primeiro (maior textureScore); os
    // demais só somam a confirmação de que aquele lugar não foi acaso.
    if (existing) existing.frames.add(frameIndex);
    else clusters.push({ region, frames: new Set([frameIndex]) });
  }

  // Cena tão curta que só rendeu um frame de amostra não tem como confirmar
  // nada — aí exigir dois descartaria tudo, o que seria pior.
  const required = Math.min(MIN_FRAMES_CONFIRMING, regionsPerFrame.length);
  return clusters
    .filter((cluster) => cluster.frames.size >= required)
    .map((cluster) => cluster.region);
}

