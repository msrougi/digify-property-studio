import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { IntakeCapability } from "../IntakeCapability.js";

describe("IntakeCapability", () => {
  it("extrai hash real e metadados reais de vídeo (ffprobe), nunca placeholder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-intake-"));
    const filePath = join(dir, "apartamento.mp4");
    await generateTestVideo(filePath, [{ color: "red", durationSec: 2 }]);

    const capability = new IntakeCapability();
    const result = await capability.execute({ filePath });

    expect(result.output.sourceVideoHash).toHaveLength(64);
    expect(result.output.fileName).toBe("apartamento.mp4");
    expect(result.output.width).toBe(64);
    expect(result.output.height).toBe(64);
    expect(result.output.durationMs).toBeGreaterThanOrEqual(1900);
    expect(result.output.durationMs).toBeLessThanOrEqual(2200);
    expect(result.output.codecName).toBeTruthy();
    expect(result.confidence.value).toBe(100);
  });

  it("gera hashes diferentes para vídeos com conteúdo diferente", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-intake-hash-"));
    const redPath = join(dir, "red.mp4");
    const bluePath = join(dir, "blue.mp4");
    await generateTestVideo(redPath, [{ color: "red", durationSec: 1 }]);
    await generateTestVideo(bluePath, [{ color: "blue", durationSec: 1 }]);

    const capability = new IntakeCapability();
    const redResult = await capability.execute({ filePath: redPath });
    const blueResult = await capability.execute({ filePath: bluePath });

    expect(redResult.output.sourceVideoHash).not.toBe(blueResult.output.sourceVideoHash);
  });
});
