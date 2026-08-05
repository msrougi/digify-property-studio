import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractGrayscaleFrame } from "../ffmpeg/extractGrayscaleFrame.js";
import { detectClutterRegions, type ClutterRegion } from "../vision/detectClutterRegions.js";
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

      const regions = detectClutterRegions(frame.buffer, frame.width, frame.height, scaledExcludeBoxes);
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

    const mergedRegions = mergeOverlappingRegions(regionsPerFrame.flat());

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
 */
function mergeOverlappingRegions(regions: ClutterRegion[]): ClutterRegion[] {
  const sorted = [...regions].sort((a, b) => b.textureScore - a.textureScore);
  const merged: ClutterRegion[] = [];

  for (const region of sorted) {
    const overlapping = merged.find((existing) => overlapRatio(region, existing) > 0.3);
    if (!overlapping) {
      merged.push(region);
    }
  }

  return merged;
}

function overlapRatio(a: ClutterRegion, b: ClutterRegion): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}
