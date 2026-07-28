import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTestVideo } from "../../../test-support/generateTestVideo.js";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { SceneDetectCapability } from "../SceneDetectCapability.js";

describe("SceneDetectCapability", () => {
  it("segmenta um vídeo real com dois cortes de cena em duas cenas contíguas", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-scene-cap-"));
    const filePath = join(dir, "duas-cenas.mp4");
    await generateTestVideo(filePath, [
      { color: "red", durationSec: 2 },
      { color: "blue", durationSec: 2 },
    ]);
    const { durationMs } = await readVideoMetadata(filePath);

    const capability = new SceneDetectCapability();
    const result = await capability.execute({ filePath, durationMs });

    expect(result.output.scenes).toHaveLength(2);
    expect(result.output.scenes[0]?.startMs).toBe(0);
    expect(result.output.scenes[result.output.scenes.length - 1]?.endMs).toBe(durationMs);
    // As cenas são contíguas: fim de uma é o início da próxima.
    expect(result.output.scenes[0]?.endMs).toBe(result.output.scenes[1]?.startMs);
    expect(result.confidence.value).toBe(100);
  });

  it("retorna uma única cena cobrindo todo o vídeo quando não há corte", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-scene-cap-single-"));
    const filePath = join(dir, "uma-cena.mp4");
    await generateTestVideo(filePath, [{ color: "green", durationSec: 2 }]);
    const { durationMs } = await readVideoMetadata(filePath);

    const capability = new SceneDetectCapability();
    const result = await capability.execute({ filePath, durationMs });

    expect(result.output.scenes).toEqual([{ startMs: 0, endMs: durationMs }]);
  });
});
