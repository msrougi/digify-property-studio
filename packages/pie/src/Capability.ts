import type { Confidence } from "@digify/domain";

/**
 * Camadas de capability — docs/CAPABILITY_REGISTRY.md.
 * "export" foi removida da taxonomia (ADR-0001, item E): é responsabilidade do
 * Rendering Engine, não do PIE™.
 */
export type CapabilityLayer =
  | "orchestration"
  | "intake"
  | "vision"
  | "production"
  | "marketing"
  | "learning"
  | "quality";

export interface CapabilityResult<TOutput> {
  output: TOutput;
  confidence: Confidence;
}

/**
 * Contrato único que toda capability (agente de IA) deve implementar.
 * Nenhuma capability chama outra diretamente — apenas através do PIE™
 * (docs/00-ARCHITECTURE.md, seção 6).
 */
export interface Capability<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly layer: CapabilityLayer;
  /**
   * `analyze` (Vision, somente leitura) nunca modifica mídia.
   * `act` (Production) sempre produz um resultado reversível.
   * Ver ADR-0001, item D (padrão Analyze/Act).
   */
  readonly mutatesMedia: boolean;
  execute(input: TInput): Promise<CapabilityResult<TOutput>>;
}
