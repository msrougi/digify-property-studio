import { describe, expect, it } from "vitest";
import { QualitySharpenCapability } from "../QualitySharpenCapability.js";

describe("QualitySharpenCapability", () => {
  it("decide um filtro unsharp conservador (luma apenas)", async () => {
    const result = await new QualitySharpenCapability().execute();

    expect(result.output.ffmpegFilter).toBe("unsharp=5:5:0.6:5:5:0.0");
    expect(result.confidence.value).toBe(100);
  });
});
