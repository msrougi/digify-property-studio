import { describe, expect, it } from "vitest";
import { Scene } from "../entities/Scene.js";
import { Confidence } from "../value-objects/Confidence.js";

describe("Scene", () => {
  it("rejeita cena com endMs <= startMs", () => {
    expect(() =>
      Scene.create({ id: "s1", projectId: "p1", startMs: 1000, endMs: 500 }),
    ).toThrow();
  });

  it("calcula duração corretamente", () => {
    const scene = Scene.create({ id: "s1", projectId: "p1", startMs: 1000, endMs: 4500 });
    expect(scene.durationMs).toBe(3500);
  });

  it("atribui ambiente com confidence — nunca modifica mídia (capability Vision)", () => {
    const scene = Scene.create({ id: "s1", projectId: "p1", startMs: 0, endMs: 5000 });
    scene.assignRoom("kitchen", Confidence.of(92));

    expect(scene.toProps().roomType).toBe("kitchen");
    expect(scene.toProps().roomConfidence).toBe(92);
  });
});
