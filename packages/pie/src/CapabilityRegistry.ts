import { DomainError } from "@digify/domain";
import type { Capability } from "./Capability.js";

/**
 * Catálogo em runtime das capabilities disponíveis — implementação viva de
 * docs/CAPABILITY_REGISTRY.md. Novas capabilities se registram sem alterar o núcleo do PIE™.
 */
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    if (this.capabilities.has(capability.id)) {
      throw new DomainError(
        `Capability já registrada: ${capability.id}`,
        "CAPABILITY_ALREADY_REGISTERED",
      );
    }
    this.capabilities.set(capability.id, capability);
  }

  get(id: string): Capability {
    const capability = this.capabilities.get(id);
    if (!capability) {
      throw new DomainError(`Capability não encontrada: ${id}`, "CAPABILITY_NOT_FOUND");
    }
    return capability;
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  list(): Capability[] {
    return [...this.capabilities.values()];
  }
}
