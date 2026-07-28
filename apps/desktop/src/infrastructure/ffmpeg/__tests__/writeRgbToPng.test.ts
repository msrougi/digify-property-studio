import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeRgbToPng } from "../writeRgbToPng.js";
import { extractCropForInpainting } from "../extractCropForInpainting.js";

describe("writeRgbToPng", () => {
  it("escreve um PNG real e legível a partir de um buffer RGB24 conhecido", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-png-"));
    const outputPath = join(dir, "cor-solida.png");

    // 2x2 vermelho puro
    const buffer = Buffer.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0]);
    await writeRgbToPng(buffer, 2, 2, outputPath);

    expect(existsSync(outputPath)).toBe(true);

    // Lê de volta via ffmpeg (o próprio extractCropForInpainting, reaproveitado
    // como leitor de imagem) pra confirmar o conteúdo, não só que o arquivo existe.
    const readBack = await extractCropForInpainting(outputPath, 0, 0, 0, 2, 2);
    expect(Array.from(readBack.buffer.subarray(0, 3))).toEqual([255, 0, 0]);
  });
});
