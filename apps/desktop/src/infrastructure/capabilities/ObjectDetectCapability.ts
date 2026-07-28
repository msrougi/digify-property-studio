import * as ort from "onnxruntime-node";
import { Confidence, type ObjectCategory } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractLetterboxedFrame } from "../ffmpeg/extractLetterboxedFrame.js";
import { bgr24ToYoloxTensor } from "../ml/yolox/bgr24ToYoloxTensor.js";
import { decodeYoloxOutput } from "../ml/yolox/decodeYoloxOutput.js";
import { nonMaxSuppression } from "../ml/yolox/nonMaxSuppression.js";
import { COCO_CLASSES } from "../ml/yolox/cocoClasses.js";
import { mapCocoClassToObjectCategory } from "../ml/yolox/objectCategoryMapping.js";

export interface ObjectDetectInput {
  filePath: string;
  atMs: number;
  frameWidth: number;
  frameHeight: number;
}

export interface DetectedObjectResult {
  cocoClass: string;
  category: ObjectCategory;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface ObjectDetectOutput {
  objects: DetectedObjectResult[];
}

const INPUT_SIZE = 416;
const SCORE_THRESHOLD = 0.3;
const IOU_THRESHOLD = 0.45;
const NUM_PREDICTIONS = 3549; // 52² + 26² + 13² para input 416 (strides 8/16/32)

/**
 * Capability `object.detect` — docs/CAPABILITY_REGISTRY.md, Vision Layer.
 * YOLOX-Nano (Megvii-BaseDetection, Apache 2.0), pré-treinado em COCO — usado
 * zero-shot, sem fine-tuning (80 classes já cobrem boa parte dos objetos
 * domésticos relevantes). Lógica de decode/NMS verificada em Python antes de
 * portar (tools/object-detector/verify_yolox.py).
 */
export class ObjectDetectCapability implements Capability<ObjectDetectInput, ObjectDetectOutput> {
  readonly id = "object.detect";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  private session: ort.InferenceSession | null = null;

  constructor(private readonly modelPath: string) {}

  private async ensureSession(): Promise<ort.InferenceSession> {
    this.session ??= await ort.InferenceSession.create(this.modelPath);
    return this.session;
  }

  async execute(input: ObjectDetectInput): Promise<CapabilityResult<ObjectDetectOutput>> {
    const session = await this.ensureSession();

    const { buffer, ratio } = await extractLetterboxedFrame(
      input.filePath,
      input.atMs,
      input.frameWidth,
      input.frameHeight,
      INPUT_SIZE,
    );
    const tensorData = bgr24ToYoloxTensor(buffer, INPUT_SIZE);

    const inputName = session.inputNames[0] as string;
    const outputName = session.outputNames[0] as string;
    const result = await session.run({
      [inputName]: new ort.Tensor("float32", tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    });
    const rawOutput = result[outputName]?.data as Float32Array;

    const rawDetections = decodeYoloxOutput(
      rawOutput,
      NUM_PREDICTIONS,
      COCO_CLASSES.length,
      INPUT_SIZE,
      ratio,
      SCORE_THRESHOLD,
    );
    const finalDetections = nonMaxSuppression(rawDetections, IOU_THRESHOLD);

    const objects: DetectedObjectResult[] = finalDetections.map((detection) => {
      const cocoClass = COCO_CLASSES[detection.classIndex] as (typeof COCO_CLASSES)[number];
      const [x1, y1, x2, y2] = detection.box;
      return {
        cocoClass,
        category: mapCocoClassToObjectCategory(cocoClass),
        confidence: Math.round(detection.score * 10000) / 100,
        boundingBox: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
      };
    });

    const averageConfidence =
      objects.length > 0
        ? objects.reduce((sum, o) => sum + o.confidence, 0) / objects.length
        : 100; // nenhum objeto encontrado é um resultado válido e determinístico

    return {
      output: { objects },
      confidence: Confidence.of(Math.round(averageConfidence)),
    };
  }
}
