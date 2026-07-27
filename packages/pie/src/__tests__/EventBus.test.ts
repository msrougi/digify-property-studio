import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../EventBus.js";

describe("EventBus", () => {
  it("entrega eventos apenas para o tipo assinado", () => {
    const bus = new EventBus();
    const startedHandler = vi.fn();
    const completedHandler = vi.fn();

    bus.on("capability.started", startedHandler);
    bus.on("capability.completed", completedHandler);

    bus.emit({ type: "capability.started", capabilityId: "lighting.analyze", projectId: "p1" });

    expect(startedHandler).toHaveBeenCalledTimes(1);
    expect(completedHandler).not.toHaveBeenCalled();
  });

  it("permite cancelar a assinatura", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on("capability.started", handler);

    unsubscribe();
    bus.emit({ type: "capability.started", capabilityId: "lighting.analyze", projectId: "p1" });

    expect(handler).not.toHaveBeenCalled();
  });
});
