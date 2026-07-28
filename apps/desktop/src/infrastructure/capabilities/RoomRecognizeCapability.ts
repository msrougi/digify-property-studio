import * as ort from "onnxruntime-node";
import { Confidence } from "@digify/domain";
import type { Capability, CapabilityResult } from "@digify/pie";
import { extractFrameRgb24 } from "../ffmpeg/extractFrame.js";
import { rgb24ToImagenetTensor } from "../ml/preprocessImage.js";

export interface RoomRecognizeInput {
  filePath: string;
  /** Timestamp (ms) do frame representativo — normalmente o meio da cena. */
  atMs: number;
}

/**
 * Rótulos que o modelo treinado reconhece hoje — ver
 * docs/ml/ROOM_CLASSIFIER.md. Subconjunto do RoomType do domínio
 * (@digify/domain); os demais tipos seguem sem suporte até haver dados de
 * treino para eles.
 */
export type RecognizedRoomType = "bedroom" | "bathroom" | "kitchen";

export interface RoomRecognizeOutput {
  roomType: RecognizedRoomType;
  probabilities: Record<RecognizedRoomType, number>;
}

/**
 * Capability `room.recognize` — docs/CAPABILITY_REGISTRY.md, Vision Layer.
 * Primeira capability do catálogo que usa um modelo de IA treinado de verdade
 * (MobileNetV2 pré-treinado em ImageNet + classificador linear treinado por
 * nós — ver tools/room-classifier/). Modelo PROTÓTIPO: dataset de treino sem
 * licença comercial clara (docs/ml/ROOM_CLASSIFIER.md) — não usar em produção
 * sem resolver isso antes.
 */
export class RoomRecognizeCapability implements Capability<RoomRecognizeInput, RoomRecognizeOutput> {
  readonly id = "room.recognize";
  readonly layer = "vision" as const;
  readonly mutatesMedia = false;

  private backboneSession: ort.InferenceSession | null = null;
  private headSession: ort.InferenceSession | null = null;

  constructor(
    private readonly backboneModelPath: string,
    private readonly headModelPath: string,
  ) {}

  private async ensureSessions(): Promise<{
    backbone: ort.InferenceSession;
    head: ort.InferenceSession;
  }> {
    this.backboneSession ??= await ort.InferenceSession.create(this.backboneModelPath);
    this.headSession ??= await ort.InferenceSession.create(this.headModelPath);
    return { backbone: this.backboneSession, head: this.headSession };
  }

  async execute(input: RoomRecognizeInput): Promise<CapabilityResult<RoomRecognizeOutput>> {
    const { backbone, head } = await this.ensureSessions();

    const frame = await extractFrameRgb24(input.filePath, input.atMs);
    const tensorData = rgb24ToImagenetTensor(frame);

    const backboneInputName = backbone.inputNames[0] as string;
    const backboneOutputName = backbone.outputNames[0] as string;
    const backboneResult = await backbone.run({
      [backboneInputName]: new ort.Tensor("float32", tensorData, [1, 3, 224, 224]),
    });
    const features = backboneResult[backboneOutputName]?.data as Float32Array;

    const headResult = await head.run({
      X: new ort.Tensor("float32", features, [1, features.length]),
    });
    const label = String((headResult["label"]?.data as unknown[])[0]);
    const probabilitiesTensor = headResult["probabilities"]?.data as Float32Array;

    // O ONNX exportado (skl2onnx) preserva a ordem alfabética das classes de
    // treino: bathroom, bedroom, kitchen — ver tools/room-classifier/models/labels.json.
    const probabilities: Record<RecognizedRoomType, number> = {
      bathroom: probabilitiesTensor[0] as number,
      bedroom: probabilitiesTensor[1] as number,
      kitchen: probabilitiesTensor[2] as number,
    };

    const confidencePercent = Math.round(Math.max(...probabilitiesTensor) * 10000) / 100;

    return {
      output: { roomType: label as RecognizedRoomType, probabilities },
      confidence: Confidence.of(confidencePercent),
    };
  }
}
