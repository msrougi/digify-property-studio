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
  /**
   * Apenas objetos temporários são removíveis por padrão — docs/reference/original-docs/08 -
   * AI Agents.md, AI Home Staging: "Pode remover: roupas, sacolas, baldes, caixas, fios,
   * brinquedos, utensílios temporários" / "Nunca remover: móveis, paredes, portas, janelas,
   * armários, eletrodomésticos fixos". Móveis e eletrodomésticos são `decorative`, não
   * `structural` (a categoria estrutural é reservada para paredes/portas/janelas), então a
   * regra não podia ser "tudo que não é structural" — teria marcado sofá/geladeira/pia como
   * removíveis.
   */
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
    const removable = input.category === "temporary";
    return new DetectedObject({ ...input, removable });
  }

  static restore(props: DetectedObjectProps): DetectedObject {
    return new DetectedObject(props);
  }

  toProps(): Readonly<DetectedObjectProps> {
    return { ...this.props };
  }
}
