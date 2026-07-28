import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { LightingAnalyzeCapability } from "../LightingAnalyzeCapability.js";

describe("LightingAnalyzeCapability", () => {
  it("classifica vídeo escuro como underexposed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-lighting-"));
    const filePath = join(dir, "black.mp4");
    await generateTestVideo(filePath, [{ color: "black", durationSec: 1 }]);

    const result = await new LightingAnalyzeCapability().execute({ filePath });

    expect(result.output.classification).toBe("underexposed");
    expect(result.confidence.value).toBe(100);
  });

  it("classifica vídeo claro como overexposed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-lighting-"));
    const filePath = join(dir, "white.mp4");
    await generateTestVideo(filePath, [{ color: "white", durationSec: 1 }]);

    const result = await new LightingAnalyzeCapability().execute({ filePath });

    expect(result.output.classification).toBe("overexposed");
  });

  it("classifica vídeo cinza médio como normal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-lighting-"));
    const filePath = join(dir, "gray.mp4");
    await generateTestVideo(filePath, [{ color: "gray", durationSec: 1 }]);

    const result = await new LightingAnalyzeCapability().execute({ filePath });

    expect(result.output.classification).toBe("normal");
  });
});
