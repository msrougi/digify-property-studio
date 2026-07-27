export type ObjectCategory =
  | "structural"
  | "decorative"
  | "temporary"
  | "personal"
  | "luxury";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedObjectProps {
  id: string;
  sceneId: string;
  category: ObjectCategory;
  boundingBox: BoundingBox;
  confidence: number;
  /** Objetos estruturais nunca são removíveis — docs/reference/original-docs/08 - AI Agents.md */
  removable: boolean;
}

export class DetectedObject {
  private constructor(private props: DetectedObjectProps) {}

  static create(input: {
    id: string;
    sceneId: string;
    category: ObjectCategory;
    boundingBox: BoundingBox;
    confidence: number;
  }): DetectedObject {
    const removable = input.category !== "structural";
    return new DetectedObject({ ...input, removable });
  }

  static restore(props: DetectedObjectProps): DetectedObject {
    return new DetectedObject(props);
  }

  toProps(): Readonly<DetectedObjectProps> {
    return { ...this.props };
  }
}
