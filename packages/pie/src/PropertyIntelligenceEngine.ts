import type { CapabilityRegistry } from "./CapabilityRegistry.js";
import type { EventBus } from "./EventBus.js";
import type { CapabilityResult } from "./Capability.js";

export interface RunOptions {
  projectId: string;
}

/**
 * Property Intelligence Engine (PIE™) — orquestrador central.
 * Nunca processa mídia. Decide quem processa e aplica o gate de confidence
 * (docs/00-ARCHITECTURE.md, seção 6). A decisão de *aplicar* um resultado
 * "confirm" cabe à Application Layer (que pode perguntar ao usuário) — o PIE™
 * apenas relata a decisão sugerida via evento, nunca aplica automaticamente
 * abaixo do limiar.
 */
export class PropertyIntelligenceEngine {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly bus: EventBus,
  ) {}

  async run<TInput, TOutput>(
    capabilityId: string,
    input: TInput,
    options: RunOptions,
  ): Promise<CapabilityResult<TOutput>> {
    const capability = this.registry.get(capabilityId);

    this.bus.emit({
      type: "capability.started",
      capabilityId,
      projectId: options.projectId,
    });

    try {
      const result = (await capability.execute(input)) as CapabilityResult<TOutput>;

      this.bus.emit({
        type: "capability.completed",
        capabilityId,
        projectId: options.projectId,
        confidence: result.confidence.value,
        decision: result.confidence.decision,
      });

      return result;
    } catch (error) {
      this.bus.emit({
        type: "capability.failed",
        capabilityId,
        projectId: options.projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
