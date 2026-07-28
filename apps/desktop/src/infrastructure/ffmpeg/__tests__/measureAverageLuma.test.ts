import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { measureAverageLuma } from "../measureAverageLuma.js";

describe("measureAverageLuma", () => {
  it("mede luminância baixa para vídeo preto", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-luma-"));
    const filePath = join(dir, "black.mp4");
    await generateTestVideo(filePath, [{ color: "black", durationSec: 1 }]);

    const luma = await measureAverageLuma(filePath);

    expect(luma).toBeLessThan(30);
  });

  it("mede luminância alta para vídeo branco", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-luma-"));
    const filePath = join(dir, "white.mp4");
    await generateTestVideo(filePath, [{ color: "white", durationSec: 1 }]);

    const luma = await measureAverageLuma(filePath);

    expect(luma).toBeGreaterThan(220);
  });

  it("mede luminância intermediária para vídeo cinza", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-luma-"));
    const filePath = join(dir, "gray.mp4");
    await generateTestVideo(filePath, [{ color: "gray", durationSec: 1 }]);

    const luma = await measureAverageLuma(filePath);

    expect(luma).toBeGreaterThan(100);
    expect(luma).toBeLessThan(160);
  });
});
