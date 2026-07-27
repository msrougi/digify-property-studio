import { EventEmitter } from "node:events";
import type { ConfidenceDecision } from "@digify/domain";

export type PieEvent =
  | { type: "capability.started"; capabilityId: string; projectId: string }
  | {
      type: "capability.completed";
      capabilityId: string;
      projectId: string;
      confidence: number;
      decision: ConfidenceDecision;
    }
  | { type: "capability.failed"; capabilityId: string; projectId: string; error: string };

type Listener<T extends PieEvent["type"]> = (event: Extract<PieEvent, { type: T }>) => void;

/**
 * Toda comunicação entre módulos passa por eventos — nenhum módulo chama outro
 * diretamente (docs/reference/original-docs/13 - Desktop Architecture.md, "Event Bus").
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  emit(event: PieEvent): void {
    this.emitter.emit(event.type, event);
  }

  on<T extends PieEvent["type"]>(type: T, listener: Listener<T>): () => void {
    this.emitter.on(type, listener as (...args: unknown[]) => void);
    return () => this.emitter.off(type, listener as (...args: unknown[]) => void);
  }
}
