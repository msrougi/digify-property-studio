import { DomainError } from "../errors/DomainError.js";

/**
 * Confidence gating thresholds — docs/00-ARCHITECTURE.md, seção 6.
 * >=95 auto | 80-94 auto_informed | 70-79 confirm | <70 reject
 */
export type ConfidenceDecision = "auto" | "auto_informed" | "confirm" | "reject";

export class Confidence {
  private constructor(readonly value: number) {}

  static of(value: number): Confidence {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new DomainError(
        `Confidence deve estar entre 0 e 100, recebido: ${value}`,
        "INVALID_CONFIDENCE",
      );
    }
    return new Confidence(value);
  }

  get decision(): ConfidenceDecision {
    if (this.value >= 95) return "auto";
    if (this.value >= 80) return "auto_informed";
    if (this.value >= 70) return "confirm";
    return "reject";
  }

  get shouldExecuteAutomatically(): boolean {
    return this.decision === "auto" || this.decision === "auto_informed";
  }
}
