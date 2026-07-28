import type { RawDetection } from "./decodeYoloxOutput.js";

function iou(a: RawDetection["box"], b: RawDetection["box"]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);

  const intersection = Math.max(0, x2 - x1 + 1) * Math.max(0, y2 - y1 + 1);
  const areaA = (a[2] - a[0] + 1) * (a[3] - a[1] + 1);
  const areaB = (b[2] - b[0] + 1) * (b[3] - b[1] + 1);

  return intersection / (areaA + areaB - intersection);
}

/**
 * NMS greedy — porta de `yolox/utils/demo_utils.py::nms` (Apache 2.0).
 * Class-agnostic: como `decodeYoloxOutput` já escolhe a melhor classe por
 * caixa, a supressão trata todas as caixas igualmente.
 */
export function nonMaxSuppression(
  detections: RawDetection[],
  iouThreshold = 0.45,
): RawDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: RawDetection[] = [];

  while (sorted.length > 0) {
    const best = sorted.shift() as RawDetection;
    kept.push(best);

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(best.box, (sorted[i] as RawDetection).box) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return kept;
}
