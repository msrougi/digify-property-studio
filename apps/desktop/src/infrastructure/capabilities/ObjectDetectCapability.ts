import * as ort from "onnxruntime-node";
import { Confidence, type ObjectCategory } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractLetterboxedFrame } from "../ffmpeg/extractLetterboxedFrame.js";
import { bgr24ToYoloxTensor } from "../ml/yolox/bgr24ToYoloxTensor.js";
import { decodeYoloxOutput, type RawDetection } from "../ml/yolox/decodeYoloxOutput.js";
import { nonMaxSuppression } from "../ml/yolox/nonMaxSuppression.js";
import { COCO_CLASSES } from "../ml/yolox/cocoClasses.js";
import { mapCocoClassToObjectCategory } from "../ml/yolox/objectCategoryMapping.js";

export interface ObjectDetectInput {
  filePath: string;
  /** Janela de tempo da cena — a detecção roda em vários frames espalhados aqui dentro, não só num instante único. */
  sceneStartMs: number;
  sceneEndMs: number;
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
/** Quantos frames reais rodar por cena — um único frame perde bagunça que só aparece em parte da cena. */
const SAMPLES_PER_SCENE = 5;

/**
 * Capability `object.detect` — docs/CAPABILITY_REGISTRY.md, Vision Layer.
 * YOLOX-Nano (Megvii-BaseDetection, Apache 2.0), pré-treinado em COCO — usado
 * zero-shot, sem fine-tuning (80 classes já cobrem boa parte dos objetos
 * domésticos relevantes). Lógica de decode/NMS verificada em Python antes de
 * portar (tools/object-detector/verify_yolox.py).
 *
 * Roda em `SAMPLES_PER_SCENE` frames reais espalhados pela cena (não só um
 * instante único) — bug real encontrado com um usuário testando um vídeo de
 * verdade: um banheiro visivelmente bagunçado voltou com zero objetos
 * detectados porque a bagunça não estava visível exatamente no frame do
 * meio. Cada frame passa pelo mesmo decode+NMS de sempre; os resultados de
 * todos os frames são unidos e passam por um NMS final (evita duplicar o
 * mesmo objeto físico visto em frames próximos).
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

  private sampleTimestamps(sceneStartMs: number, sceneEndMs: number): number[] {
    const durationMs = Math.max(0, sceneEndMs - sceneStartMs);
    // Espaçados uniformemente, evitando as bordas exatas (frames de
    // transição de corte, menos representativos da cena).
    const timestamps: number[] = [];
    for (let i = 0; i < SAMPLES_PER_SCENE; i++) {
      const fraction = (i + 1) / (SAMPLES_PER_SCENE + 1);
      timestamps.push(Math.round(sceneStartMs + fraction * durationMs));
    }
    return [...new Set(timestamps)];
  }

  private async detectInFrame(
    session: ort.InferenceSession,
    filePath: string,
    atMs: number,
    frameWidth: number,
    frameHeight: number,
  ): Promise<RawDetection[]> {
    const { buffer, ratio } = await extractLetterboxedFrame(
      filePath,
      atMs,
      frameWidth,
      frameHeight,
      INPUT_SIZE,
    );
    const tensorData = bgr24ToYoloxTensor(buffer, INPUT_SIZE);

    const inputName = session.inputNames[0] as string;
    const outputName = session.outputNames[0] as string;
    const result = await session.run({
      [inputName]: new ort.Tensor("float32", tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    });
    const rawOutput = result[outputName]?.data as Float32Array;

    return decodeYoloxOutput(rawOutput, NUM_PREDICTIONS, COCO_CLASSES.length, INPUT_SIZE, ratio, SCORE_THRESHOLD);
  }

  async execute(input: ObjectDetectInput): Promise<CapabilityResult<ObjectDetectOutput>> {
    const session = await this.ensureSession();

    const timestamps = this.sampleTimestamps(input.sceneStartMs, input.sceneEndMs);
    // Sequencial de propósito: `InferenceSession.run` não tem garantia de
    // ser seguro pra chamadas concorrentes na mesma sessão.
    const mergedDetections: RawDetection[] = [];
    for (const atMs of timestamps) {
      const detections = await this.detectInFrame(
        session,
        input.filePath,
        atMs,
        input.frameWidth,
        input.frameHeight,
      );
      mergedDetections.push(...detections);
    }
    const finalDetections = nonMaxSuppression(mergedDetections, IOU_THRESHOLD);

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
