import { Confidence } from "../value-objects/Confidence.js";

export type RoomType =
  | "living_room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "balcony"
  | "pool"
  | "garage"
  | "other";

export interface SceneProps {
  id: string;
  projectId: string;
  startMs: number;
  endMs: number;
  roomType: RoomType | null;
  roomConfidence: number | null;
}

/**
 * Produzida pela capability `scene.detect` + `room.recognize` (Vision, somente leitura).
 */
export class Scene {
  private constructor(private props: SceneProps) {}

  static create(input: {
    id: string;
    projectId: string;
    startMs: number;
    endMs: number;
  }): Scene {
    if (input.endMs <= input.startMs) {
      throw new Error(`Cena inválida: endMs (${input.endMs}) <= startMs (${input.startMs})`);
    }
    return new Scene({
      id: input.id,
      projectId: input.projectId,
      startMs: input.startMs,
      endMs: input.endMs,
      roomType: null,
      roomConfidence: null,
    });
  }

  static restore(props: SceneProps): Scene {
    return new Scene(props);
  }

  assignRoom(roomType: RoomType, confidence: Confidence): void {
    this.props.roomType = roomType;
    this.props.roomConfidence = confidence.value;
  }

  get durationMs(): number {
    return this.props.endMs - this.props.startMs;
  }

  toProps(): Readonly<SceneProps> {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
}
