import { describe, expect, it } from "vitest";
import { PropertyScoreCapability } from "../PropertyScoreCapability.js";

describe("PropertyScoreCapability", () => {
  it("nota 100 quando todas as cenas têm exposição normal e não há bagunça", async () => {
    const result = await new PropertyScoreCapability().execute({
      lightingClassifications: ["normal", "normal", "normal"],
      temporaryObjectsCount: 0,
    });

    expect(result.output.score).toBe(100);
    expect(result.output.suggestions).toHaveLength(0);
  });

  it("penaliza cenas mal iluminadas e gera sugestão específica", async () => {
    const result = await new PropertyScoreCapability().execute({
      lightingClassifications: ["normal", "underexposed", "overexposed"],
      temporaryObjectsCount: 0,
    });

    expect(result.output.lightingScore).toBe(33);
    expect(result.output.suggestions.some((s) => s.includes("2 cena(s)"))).toBe(true);
  });

  it("penaliza objetos temporários e gera sugestão específica", async () => {
    const result = await new PropertyScoreCapability().execute({
      lightingClassifications: ["normal"],
      temporaryObjectsCount: 3,
    });

    expect(result.output.organizationScore).toBe(55);
    expect(result.output.suggestions.some((s) => s.includes("3 objeto(s)"))).toBe(true);
  });

  it("nunca fica negativo mesmo com muita bagunça", async () => {
    const result = await new PropertyScoreCapability().execute({
      lightingClassifications: ["normal"],
      temporaryObjectsCount: 20,
    });

    expect(result.output.organizationScore).toBe(0);
    expect(result.output.score).toBeGreaterThanOrEqual(0);
  });
});
