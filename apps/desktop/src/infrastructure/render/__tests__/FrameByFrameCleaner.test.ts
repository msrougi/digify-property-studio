import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMovingClutteredTestVideo } from "../../../test-support/generateMovingClutteredTestVideo.js";
import { extractRgbFrame } from "../../ffmpeg/extractRgbFrame.js";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { FrameByFrameCleaner } from "../FrameByFrameCleaner.js";

const LAMA_PATH = join(process.cwd(), "models", "lama_inpainting.onnx");
const YOLOX_PATH = join(process.cwd(), "models", "yolox_nano.onnx");
// O LaMa (~196MB) é remontado a partir de models/*.parts no build. Onde ele
// não estiver montado, o teste não tem o que verificar — pular é honesto,
// inventar um dublê de inferência não seria.
const describeWithModels =
  existsSync(LAMA_PATH) && existsSync(YOLOX_PATH) ? describe : describe.skip;

const WIDTH = 320;
const HEIGHT = 240;

/** Variância da luma: mede quanto "detalhe" existe numa região. */
function variance(
  buffer: Buffer,
  width: number,
  box: { x: number; y: number; width: number; height: number },
): number {
  const values: number[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      values.push(buffer[y * width + x] as number);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

describeWithModels("FrameByFrameCleaner", () => {
  it(
    "não toca em cômodo mobiliado sem objeto solto — a regressão que motivou trocar textura por semântica",
    async () => {
      // Estes três vídeos são cômodos reais, bem montados, SEM bagunça. A
      // versão por anomalia de textura borrava a coifa, apagava o lustre e a
      // planta justamente aqui: pra ela, "textura diferente de parede" era
      // sinônimo de sujeira. Detecção semântica não tem como cometer esse
      // erro, e este teste existe pra garantir que não volte.
      const dir = mkdtempSync(join(tmpdir(), "digify-fbf-mobiliado-"));
      const fixtures = join(process.cwd(), "src", "infrastructure", "capabilities", "__fixtures__");

      for (const room of ["kitchen", "bedroom", "bathroom"]) {
        const sourcePath = join(fixtures, `${room}-sample.mp4`);
        const outputPath = join(dir, `${room}.mp4`);

        const cleaner = new FrameByFrameCleaner(LAMA_PATH, YOLOX_PATH);
        const { framesChanged, framesProcessed, produced } = await cleaner.clean(
          sourcePath,
          outputPath,
        );

        expect(framesProcessed).toBeGreaterThan(0);
        // Nenhum quadro alterado: não há objeto solto pra remover nesses cômodos.
        expect({ room, framesChanged }).toEqual({ room, framesChanged: 0 });
        // E, mais importante, NENHUM arquivo é entregue. Recodificar sem
        // alterar um pixel só degradaria (medido: PSNR ~46 dB de perda à
        // toa), e o render final ainda recodifica por cima. Quem não teve
        // nada removido tem que sair com o vídeo original, intacto.
        expect({ room, produced }).toEqual({ room, produced: false });
        expect({ room, existe: existsSync(outputPath) }).toEqual({ room, existe: false });
      }
    },
    300_000,
  );

  it(
    "preserva dimensões, duração e reporta progresso de todos os quadros",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-fbf-"));
      const sourcePath = join(dir, "sala.mp4");
      const outputPath = join(dir, "limpa.mp4");

      await generateMovingClutteredTestVideo(
        sourcePath,
        { width: WIDTH, height: HEIGHT },
        { x: 40, y: 60, width: 90, height: 70, driftPxPerSec: 60 },
        1,
        10,
      );

      const progress: number[] = [];
      const cleaner = new FrameByFrameCleaner(LAMA_PATH, YOLOX_PATH, {
        // Força a remoção de qualquer coisa que o detector enxergue, só pra
        // que este vídeo sintético gere de fato um arquivo de saída — o que
        // está sob teste aqui é a geometria e o progresso, não a decisão.
        minConfidence: 0.01,
      });
      expect(cleaner.isAvailable()).toBe(true);
      const { produced } = await cleaner.clean(sourcePath, outputPath, (update) =>
        progress.push(update.framesProcessed),
      );

      // Todo quadro tem que passar pelo pipeline — se algum escapasse, o
      // objeto reapareceria piscando no vídeo final.
      expect(progress.length).toBe(10);
      expect(progress.at(-1)).toBe(10);

      if (produced) {
        const sourceMeta = await readVideoMetadata(sourcePath);
        const outputMeta = await readVideoMetadata(outputPath);
        expect(outputMeta.width).toBe(sourceMeta.width);
        expect(outputMeta.height).toBe(sourceMeta.height);
        expect(outputMeta.durationMs).toBeGreaterThanOrEqual(sourceMeta.durationMs - 200);
      }
    },
    120_000,
  );

  it(
    "sem modelo não se declara disponível — o render cai no caminho antigo em vez de falhar",
    () => {
      const inexistente = join(tmpdir(), "nao-existe-lama.onnx");
      expect(new FrameByFrameCleaner(inexistente, YOLOX_PATH).isAvailable()).toBe(false);
      expect(new FrameByFrameCleaner(LAMA_PATH, inexistente).isAvailable()).toBe(false);
      expect(new FrameByFrameCleaner(LAMA_PATH, YOLOX_PATH).isAvailable()).toBe(true);
    },
  );

  it(
    "apaga de verdade a caixa pedida e não encosta em nada fora dela",
    async () => {
      // Exercita o código que ALTERA pixel, direto, com uma caixa conhecida.
      // Passar pelo detector aqui exigiria um vídeo de teste em que o YOLOX
      // reconhecesse uma classe específica — dependência frágil pra provar
      // uma coisa que não é sobre detecção.
      const fixture = join(
        process.cwd(),
        "src",
        "infrastructure",
        "capabilities",
        "__fixtures__",
        "kitchen-sample.mp4",
      );
      const probe = await readVideoMetadata(fixture);
      const frame = await extractRgbFrame(fixture, 500, probe.width, probe.height, probe.width);
      const meta = { width: frame.width, height: frame.height };

      const alvo = { x: 60, y: 90, width: 48, height: 56 };
      const cleaner = new FrameByFrameCleaner(LAMA_PATH, YOLOX_PATH);
      const session = await cleaner.openInpaintingSession();
      const limpo = await cleaner.eraseBoxes(
        session,
        frame.buffer,
        meta.width,
        meta.height,
        [alvo],
      );

      // Dentro da caixa: mudou de verdade (não é uma cópia devolvida intacta).
      let mudouDentro = 0;
      for (let y = alvo.y + 8; y < alvo.y + alvo.height - 8; y++) {
        for (let x = alvo.x + 8; x < alvo.x + alvo.width - 8; x++) {
          const i = (y * meta.width + x) * 3;
          if (Math.abs((limpo[i] as number) - (frame.buffer[i] as number)) > 3) mudouDentro++;
        }
      }
      expect(mudouDentro).toBeGreaterThan(0);

      // Longe da caixa: byte a byte idêntico. O remendo não pode vazar pro
      // resto do cômodo — foi exatamente esse vazamento que estragou a versão
      // anterior.
      for (const [x, y] of [
        [5, 5],
        [meta.width - 6, 5],
        [5, meta.height - 6],
        [meta.width - 6, meta.height - 6],
      ]) {
        const i = ((y as number) * meta.width + (x as number)) * 3;
        expect([limpo[i], limpo[i + 1], limpo[i + 2]]).toEqual([
          frame.buffer[i],
          frame.buffer[i + 1],
          frame.buffer[i + 2],
        ]);
      }
    },
    180_000,
  );
});
