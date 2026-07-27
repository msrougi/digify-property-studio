import { describe, expect, it } from "vitest";
import { Confidence } from "@digify/domain";
import { CapabilityRegistry } from "../CapabilityRegistry.js";
import type { Capability } from "../Capability.js";

function fakeCapability(id: string): Capability<void, string> {
  return {
    id,
    layer: "vision",
    mutatesMedia: false,
    async execute() {
      return { output: "ok", confidence: Confidence.of(99) };
    },
  };
}

describe("CapabilityRegistry", () => {
  it("registra e recupera uma capability", () => {
    const registry = new CapabilityRegistry();
    registry.register(fakeCapability("scene.detect"));

    expect(registry.has("scene.detect")).toBe(true);
    expect(registry.get("scene.detect").id).toBe("scene.detect");
  });

  it("rejeita registro duplicado", () => {
    const registry = new CapabilityRegistry();
    registry.register(fakeCapability("scene.detect"));

    expect(() => registry.register(fakeCapability("scene.detect"))).toThrow(
      /já registrada/,
    );
  });

  it("lança erro ao buscar capability inexistente", () => {
    const registry = new CapabilityRegistry();
    expect(() => registry.get("unknown")).toThrow(/não encontrada/);
  });

  it("lista todas as capabilities registradas", () => {
    const registry = new CapabilityRegistry();
    registry.register(fakeCapability("scene.detect"));
    registry.register(fakeCapability("room.recognize"));

    expect(registry.list().map((c) => c.id).sort()).toEqual([
      "room.recognize",
      "scene.detect",
    ]);
  });
});
