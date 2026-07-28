import { describe, expect, it } from "vitest";
import { ColorActCapability } from "../ColorActCapability.js";

describe("ColorActCapability", () => {
  it.each([
    ["warm", /colorbalance/],
    ["minimal", /saturation=0\.85/],
    ["luxury", /contrast=1\.15/],
  ] as const)("gera um filtro FFmpeg distinto para o perfil %s", async (profile, expected) => {
    const result = await new ColorActCapability().execute({ profile });
    expect(result.output.ffmpegFilter).toMatch(expected);
  });

  it("perfis diferentes produzem filtros diferentes entre si", async () => {
    const capability = new ColorActCapability();
    const warm = await capability.execute({ profile: "warm" });
    const minimal = await capability.execute({ profile: "minimal" });
    const luxury = await capability.execute({ profile: "luxury" });

    const filters = [warm, minimal, luxury].map((r) => r.output.ffmpegFilter);
    expect(new Set(filters).size).toBe(3);
  });
});
