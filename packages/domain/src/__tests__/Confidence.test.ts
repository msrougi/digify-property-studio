import { describe, expect, it } from "vitest";
import { Confidence } from "../value-objects/Confidence.js";

describe("Confidence", () => {
  it.each([
    [98, "auto"],
    [95, "auto"],
    [85, "auto_informed"],
    [80, "auto_informed"],
    [74, "confirm"],
    [70, "confirm"],
    [42, "reject"],
    [0, "reject"],
  ] as const)("valor %i resulta em decisão %s", (value, expected) => {
    expect(Confidence.of(value).decision).toBe(expected);
  });

  it("rejeita valores fora de 0-100", () => {
    expect(() => Confidence.of(-1)).toThrow();
    expect(() => Confidence.of(101)).toThrow();
  });

  it("shouldExecuteAutomatically é falso quando confidence exige confirmação ou rejeição", () => {
    expect(Confidence.of(70).shouldExecuteAutomatically).toBe(false);
    expect(Confidence.of(42).shouldExecuteAutomatically).toBe(false);
    expect(Confidence.of(80).shouldExecuteAutomatically).toBe(true);
    expect(Confidence.of(96).shouldExecuteAutomatically).toBe(true);
  });
});
