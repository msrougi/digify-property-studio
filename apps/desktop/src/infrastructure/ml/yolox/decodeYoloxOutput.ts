export interface RawDetection {
  /** Bounding box em coordenadas xyxy, no espaço da imagem original (não 416x416). */
  box: [number, number, number, number];
  classIndex: number;
  score: number;
}

const STRIDES = [8, 16, 32];

/**
 * Decodifica a saída bruta do YOLOX (grid + stride encoding) para caixas
 * xyxy no espaço da imagem original. Porta exata de
 * `yolox/utils/demo_utils.py::demo_postprocess` + a matemática de
 * center/size -> xyxy do script de demo oficial (verificado em Python antes
 * de portar — ver tools/object-detector/verify_yolox.py).
 */
export function decodeYoloxOutput(
  output: Float32Array,
  numPredictions: number,
  numClasses: number,
  inputSize: number,
  ratio: number,
  scoreThreshold: number,
): RawDetection[] {
  const numAttrs = numClasses + 5;
  const detections: RawDetection[] = [];

  let predictionIndex = 0;
  for (const stride of STRIDES) {
    const gridSize = inputSize / stride;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        if (predictionIndex >= numPredictions) break;

        const base = predictionIndex * numAttrs;

        const centerX = (output[base] as number + gx) * stride;
        const centerY = (output[base + 1] as number + gy) * stride;
        const width = Math.exp(output[base + 2] as number) * stride;
        const height = Math.exp(output[base + 3] as number) * stride;
        const objectness = output[base + 4] as number;

        let bestClassIndex = 0;
        let bestClassScore = 0;
        for (let c = 0; c < numClasses; c++) {
          const classScore = output[base + 5 + c] as number;
          if (classScore > bestClassScore) {
            bestClassScore = classScore;
            bestClassIndex = c;
          }
        }

        const score = objectness * bestClassScore;
        if (score > scoreThreshold) {
          const x1 = (centerX - width / 2) / ratio;
          const y1 = (centerY - height / 2) / ratio;
          const x2 = (centerX + width / 2) / ratio;
          const y2 = (centerY + height / 2) / ratio;
          detections.push({ box: [x1, y1, x2, y2], classIndex: bestClassIndex, score });
        }

        predictionIndex++;
      }
    }
  }

  return detections;
}
