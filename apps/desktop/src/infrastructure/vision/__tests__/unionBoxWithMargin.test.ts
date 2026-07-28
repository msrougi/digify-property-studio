import { describe, expect, it } from "vitest";
import { computeUnionBoxWithMargin } from "../unionBoxWithMargin.js";

describe("computeUnionBoxWithMargin", () => {
  it("uma única caixa recebe margem em todos os lados", () => {
    const box = computeUnionBoxWithMargin(
      [{ x: 100, y: 100, width: 50, height: 50 }],
      20,
      1000,
      1000,
    );
    expect(box).toEqual({ x: 80, y: 80, width: 90, height: 90 });
  });

  it("várias caixas produzem a união real de todas + margem", () => {
    const box = computeUnionBoxWithMargin(
      [
        { x: 100, y: 100, width: 20, height: 20 },
        { x: 300, y: 200, width: 20, height: 20 },
      ],
      10,
      1000,
      1000,
    );
    // esquerda=100, topo=100, direita=320, base=220; margem 10 em cada lado.
    expect(box).toEqual({ x: 90, y: 90, width: 240, height: 140 });
  });

  it("nunca ultrapassa os limites do frame", () => {
    const box = computeUnionBoxWithMargin([{ x: 5, y: 5, width: 10, height: 10 }], 50, 100, 80);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBeLessThanOrEqual(100);
    expect(box.height).toBeLessThanOrEqual(80);
  });
});
