import { describe, expect, it, vi } from "vitest";
import { Confidence } from "@digify/domain";
import { CapabilityRegistry } from "../CapabilityRegistry.js";
import { EventBus } from "../EventBus.js";
import { PropertyIntelligenceEngine } from "../PropertyIntelligenceEngine.js";
import type { Capability } from "../Capability.js";

describe("PropertyIntelligenceEngine", () => {
  it("executa a capability e emite started/completed com a decisão de confidence", async () => {
    const registry = new CapabilityRegistry();
    const bus = new EventBus();
    const pie = new PropertyIntelligenceEngine(registry, bus);

    const highConfidence: Capability<void, string> = {
      id: "color.act",
      layer: "production",
      mutatesMedia: true,
      async execute() {
        return { output: "aplicado", confidence: Confidence.of(97) };
      },
    };
    registry.register(highConfidence);

    const events: string[] = [];
    bus.on("capability.started", () => events.push("started"));
    bus.on("capability.completed", (event) => events.push(`completed:${event.decision}`));

    const result = await pie.run<void, string>("color.act", undefined, { projectId: "p1" });

    expect(result.output).toBe("aplicado");
    expect(events).toEqual(["started", "completed:auto"]);
  });

  it("reporta decisão 'confirm' para confidence entre 70 e 79 sem aplicar automaticamente", async () => {
    const registry = new CapabilityRegistry();
    const bus = new EventBus();
    const pie = new PropertyIntelligenceEngine(registry, bus);

    registry.register({
      id: "home_staging.act",
      layer: "production",
      mutatesMedia: true,
      async execute() {
        return { output: "sugestao", confidence: Confidence.of(74) };
      },
    } satisfies Capability<void, string>);

    let decision: string | undefined;
    bus.on("capability.completed", (event) => {
      decision = event.decision;
    });

    const result = await pie.run<void, string>("home_staging.act", undefined, {
      projectId: "p1",
    });

    expect(decision).toBe("confirm");
    expect(result.confidence.shouldExecuteAutomatically).toBe(false);
  });

  it("emite capability.failed e propaga o erro quando a capability lança exceção", async () => {
    const registry = new CapabilityRegistry();
    const bus = new EventBus();
    const pie = new PropertyIntelligenceEngine(registry, bus);

    registry.register({
      id: "object.detect",
      layer: "vision",
      mutatesMedia: false,
      async execute() {
        throw new Error("modelo indisponível");
      },
    } satisfies Capability<void, unknown>);

    const failedHandler = vi.fn();
    bus.on("capability.failed", failedHandler);

    await expect(
      pie.run("object.detect", undefined, { projectId: "p1" }),
    ).rejects.toThrow("modelo indisponível");

    expect(failedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ capabilityId: "object.detect", error: "modelo indisponível" }),
    );
  });
});
