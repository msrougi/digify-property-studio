import { describe, expect, it } from "vitest";
import { ReflectionAnalyzeCapability } from "../ReflectionAnalyzeCapability.js";

describe("ReflectionAnalyzeCapability (algoritmo real de supressão de reflexo, medido contra vídeos de exemplo reais)", () => {
  it("mede um meanAbsoluteChange real e positivo num vídeo real (bedroom-sample)", async () => {
    const result = await new ReflectionAnalyzeCapability().execute({
      filePath: "src/infrastructure/capabilities/__fixtures__/bedroom-sample.mp4",
      atMs: 500,
      frameWidth: 1920,
      frameHeight: 1080,
    });

    expect(result.output.meanAbsoluteChange).toBeGreaterThan(0);
    expect(result.output.meanAbsoluteChange).toBeLessThan(1);
  });

  it("não muda nada num frame de cor sólida (sem gradiente nenhum, nada pra suprimir)", async () => {
    const { generateTestVideo } = await import("../../../test-support/generateTestVideo.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "digify-reflection-flat-"));
    const videoPath = join(dir, "solido.mp4");
    await generateTestVideo(videoPath, [{ color: "gray", durationSec: 1 }], { size: "320x240" });

    const result = await new ReflectionAnalyzeCapability().execute({
      filePath: videoPath,
      atMs: 200,
      frameWidth: 320,
      frameHeight: 240,
    });

    expect(result.output.meanAbsoluteChange).toBeCloseTo(0, 3);
  });
});
