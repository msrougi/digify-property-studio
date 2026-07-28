import { describe, expect, it } from "vitest";
import { ColorActCapability, type ColorProfile } from "../ColorActCapability.js";

const ALL_PROFILES: ColorProfile[] = [
  "warm",
  "minimal",
  "luxury",
  "modern",
  "industrial",
  "beach",
  "scandinavian",
  "corporate",
];

describe("ColorActCapability", () => {
  it.each([
    ["warm", /colorbalance/],
    ["minimal", /saturation=0\.85/],
    ["luxury", /contrast=1\.15/],
    ["modern", /contrast=1\.12/],
    ["industrial", /saturation=0\.7/],
    ["beach", /saturation=1\.2/],
    ["scandinavian", /brightness=0\.04/],
    ["corporate", /saturation=0\.9/],
  ] as const)("gera um filtro FFmpeg distinto para o perfil %s", async (profile, expected) => {
    const result = await new ColorActCapability().execute({ profile });
    expect(result.output.ffmpegFilter).toMatch(expected);
  });

  it("todos os 8 perfis produzem filtros distintos entre si", async () => {
    const capability = new ColorActCapability();
    const results = await Promise.all(
      ALL_PROFILES.map((profile) => capability.execute({ profile })),
    );

    const filters = results.map((r) => r.output.ffmpegFilter);
    expect(new Set(filters).size).toBe(ALL_PROFILES.length);
  });
});
