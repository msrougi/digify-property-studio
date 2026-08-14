import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { FFMPEG_PATH } from "../../ffmpeg/paths.js";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { extractGrayscaleFrame } from "../../ffmpeg/extractGrayscaleFrame.js";
import { extractRgbFrame } from "../../ffmpeg/extractRgbFrame.js";
import { composeLogoCard } from "../composeLogoCard.js";
import { SlideshowRenderer } from "../SlideshowRenderer.js";

const execFileAsync = promisify(execFile);

/** Gera uma "foto" real via FFmpeg — nunca um arquivo fake. */
async function makePhoto(path: string, color: string, size = "1600x1200"): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=${color}:size=${size}`,
    "-frames:v", "1",
    path,
  ]);
}

describe("SlideshowRenderer", () => {
  it(
    "monta um vídeo real a partir de fotos, com a duração pedida descontando as transições",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slideshow-"));
      const fotos = ["red", "green", "blue"].map((cor) => join(dir, `${cor}.png`));
      await Promise.all(fotos.map((path, i) => makePhoto(path, ["red", "green", "blue"][i] as string)));

      const outputPath = join(dir, "video.mp4");
      const progresso: number[] = [];
      const { durationSec } = await new SlideshowRenderer().render(
        {
          slides: fotos.map((imagePath) => ({ imagePath, durationSec: 3 })),
          outputPath,
          workDir: dir,
          width: 1280,
          height: 720,
          fps: 25,
          transitionSec: 0.5,
        },
        (progress) => progresso.push(progress.percent),
      );

      // 3 slides de 3s, ligados por 2 transições de 0,5s: 9 - 1 = 8s.
      expect(durationSec).toBeCloseTo(8, 3);

      const meta = await readVideoMetadata(outputPath);
      expect(meta.width).toBe(1280);
      expect(meta.height).toBe(720);
      expect(meta.durationMs).toBeGreaterThan(7500);
      expect(meta.durationMs).toBeLessThan(8500);

      // Progresso real vindo do FFmpeg, não inventado.
      expect(progresso.length).toBeGreaterThan(1);
      expect(progresso.at(-1)).toBe(100);
    },
    120_000,
  );

  it(
    "aplica Ken Burns de verdade — o enquadramento muda ao longo de um slide parado",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slideshow-kb-"));
      const foto = join(dir, "cena.png");
      // Imagem com estrutura: sem detalhe não dá pra perceber movimento.
      await execFileAsync(FFMPEG_PATH, [
        "-y", "-f", "lavfi", "-i", "testsrc2=size=1600x1200", "-frames:v", "1", foto,
      ]);

      const outputPath = join(dir, "kb.mp4");
      await new SlideshowRenderer().render({
        slides: [{ imagePath: foto, durationSec: 4 }],
        outputPath,
        workDir: dir,
        width: 640,
        height: 360,
        fps: 25,
      });

      const inicio = await extractGrayscaleFrame(outputPath, 200, 640, 360);
      const fim = await extractGrayscaleFrame(outputPath, 3600, 640, 360);

      // Foto PARADA: sem Ken Burns os dois quadros seriam idênticos.
      let diferentes = 0;
      for (let i = 0; i < inicio.buffer.length; i++) {
        if (Math.abs((inicio.buffer[i] as number) - (fim.buffer[i] as number)) > 8) diferentes++;
      }
      expect(diferentes / inicio.buffer.length).toBeGreaterThan(0.1);
    },
    120_000,
  );

  it(
    "queima a legenda no vídeo (o FFmpeg embarcado não tem drawtext — isto prova que o caminho ASS funciona)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slideshow-txt-"));
      const foto = join(dir, "preta.png");
      await makePhoto(foto, "black", "1280x720");

      const semLegenda = join(dir, "sem.mp4");
      const comLegenda = join(dir, "com.mp4");
      const renderer = new SlideshowRenderer();
      const base = { workDir: dir, width: 1280, height: 720, fps: 25 } as const;

      await renderer.render({
        ...base,
        slides: [{ imagePath: foto, durationSec: 2 }],
        outputPath: semLegenda,
      });
      await renderer.render({
        ...base,
        slides: [{ imagePath: foto, durationSec: 2, caption: "Apartamento 3 quartos — R$ 850.000" }],
        outputPath: comLegenda,
      });

      // Fundo preto: qualquer pixel claro no meio do vídeo é texto branco.
      const semTexto = await extractGrayscaleFrame(semLegenda, 1000, 1280, 720);
      const comTexto = await extractGrayscaleFrame(comLegenda, 1000, 1280, 720);
      const claros = (buffer: Buffer): number =>
        buffer.reduce((total, valor) => total + (valor > 180 ? 1 : 0), 0);

      expect(claros(semTexto.buffer)).toBe(0);
      expect(claros(comTexto.buffer)).toBeGreaterThan(200);
    },
    120_000,
  );

  it(
    "música mais curta que o vídeo NÃO encurta o vídeo — ela se repete",
    async () => {
      // Bug real medido: `-shortest` com faixa curta cortava o VÍDEO no
      // tamanho da música (10,8s viravam 4s). O usuário perderia dois terços
      // do trabalho sem entender por quê.
      const dir = mkdtempSync(join(tmpdir(), "digify-slideshow-audio-curto-"));
      const fotos = ["red", "green", "blue"].map((cor) => join(dir, `${cor}.png`));
      await Promise.all(
        fotos.map((path, i) => makePhoto(path, ["red", "green", "blue"][i] as string)),
      );

      const musica = join(dir, "curta.mp3");
      await execFileAsync(FFMPEG_PATH, [
        "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:a", "libmp3lame", musica,
      ]);

      const outputPath = join(dir, "video.mp4");
      const { durationSec } = await new SlideshowRenderer().render({
        slides: fotos.map((imagePath) => ({ imagePath, durationSec: 4 })),
        outputPath,
        workDir: dir,
        width: 1280,
        height: 720,
        fps: 25,
        transitionSec: 0.6,
        audioPath: musica,
      });

      expect(durationSec).toBeCloseTo(10.8, 1);
      const meta = await readVideoMetadata(outputPath);
      // O vídeo tem que manter a própria duração, não a da música.
      expect(meta.durationMs).toBeGreaterThan(10_000);
      expect(meta.hasAudio).toBe(true);
    },
    180_000,
  );

  it(
    "a música toca de verdade e some no fim (fade), em vez de cortar seca",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slideshow-audio-fade-"));
      const foto = join(dir, "foto.png");
      await makePhoto(foto, "gray");

      const musica = join(dir, "trilha.mp3");
      await execFileAsync(FFMPEG_PATH, [
        "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=30", "-c:a", "libmp3lame", musica,
      ]);

      const outputPath = join(dir, "com-som.mp4");
      await new SlideshowRenderer().render({
        slides: [{ imagePath: foto, durationSec: 8 }],
        outputPath,
        workDir: dir,
        width: 640,
        height: 360,
        fps: 25,
        audioPath: musica,
      });

      // Volume real medido pelo FFmpeg em duas janelas: o miolo tem som, e o
      // último segundo (dentro do fade de saída) tem bem menos.
      const volume = async (de: number, ate: number): Promise<number> => {
        const { stderr } = await execFileAsync(FFMPEG_PATH, [
          "-ss", String(de), "-to", String(ate), "-i", outputPath,
          "-af", "volumedetect", "-f", "null", "-",
        ]);
        const match = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
        return match ? Number(match[1]) : -Infinity;
      };

      const miolo = await volume(3, 5);
      const fim = await volume(7.5, 8);

      // -91 dB é o "silêncio" que o FFmpeg reporta quando não há sinal.
      expect(miolo).toBeGreaterThan(-40);
      expect(fim).toBeLessThan(miolo - 5);
    },
    180_000,
  );

  it(
    "aplica a marca d'água só no canto inferior direito, sem vazar pro resto do quadro",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slideshow-marca-"));
      // Logo amarelo sobre fundo transparente; foto azul escura sem amarelo
      // nenhum. Assim qualquer pixel amarelo no resultado veio da marca.
      const logo = join(dir, "logo.png");
      await execFileAsync(FFMPEG_PATH, [
        "-y",
        "-f", "lavfi", "-i", "color=c=black@0:size=400x400,format=rgba",
        "-f", "lavfi", "-i", "color=c=yellow:size=300x160",
        "-filter_complex", "[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto",
        "-frames:v", "1", logo,
      ]);
      const foto = join(dir, "foto.png");
      await makePhoto(foto, "0x102040");

      const renderer = new SlideshowRenderer();
      const base = { workDir: dir, width: 1280, height: 720, fps: 25 } as const;
      const sem = join(dir, "sem.mp4");
      const com = join(dir, "com.mp4");
      await renderer.render({ ...base, slides: [{ imagePath: foto, durationSec: 3 }], outputPath: sem });
      await renderer.render({
        ...base,
        slides: [{ imagePath: foto, durationSec: 3 }],
        outputPath: com,
        watermarkPath: logo,
      });

      const amarelos = async (video: string): Promise<{ canto: number; resto: number }> => {
        const frame = await extractRgbFrame(video, 1500, 1280, 720, 1280);
        let canto = 0;
        let resto = 0;
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            const i = (y * frame.width + x) * 3;
            const [r, g, b] = [frame.buffer[i] as number, frame.buffer[i + 1] as number, frame.buffer[i + 2] as number];
            if (r > 150 && g > 150 && b < 110) {
              if (x > frame.width * 0.7 && y > frame.height * 0.65) canto++;
              else resto++;
            }
          }
        }
        return { canto, resto };
      };

      expect(await amarelos(sem)).toEqual({ canto: 0, resto: 0 });
      const comMarca = await amarelos(com);
      expect(comMarca.canto).toBeGreaterThan(1000);
      // Zero fora do canto: a marca não pode aparecer no meio do imóvel.
      expect(comMarca.resto).toBe(0);
    },
    180_000,
  );

  it(
    "abre e encerra com a arte do logo, sem movimento de câmera",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slideshow-capa-"));
      const logo = join(dir, "logo.png");
      await execFileAsync(FFMPEG_PATH, [
        "-y",
        "-f", "lavfi", "-i", "color=c=black@0:size=400x400,format=rgba",
        "-f", "lavfi", "-i", "color=c=yellow:size=300x160",
        "-filter_complex", "[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto",
        "-frames:v", "1", logo,
      ]);
      const foto = join(dir, "foto.png");
      await makePhoto(foto, "0x102040");

      const capa = join(dir, "capa.png");
      await composeLogoCard(logo, capa, 1280, 720, "0x1A1A2E");

      const outputPath = join(dir, "full.mp4");
      await new SlideshowRenderer().render({
        workDir: dir,
        width: 1280,
        height: 720,
        fps: 25,
        outputPath,
        slides: [
          { imagePath: capa, durationSec: 2, staticFrame: true },
          { imagePath: foto, durationSec: 3 },
          { imagePath: capa, durationSec: 2, staticFrame: true },
        ],
      });

      const amareloCentral = async (ms: number): Promise<number> => {
        const frame = await extractRgbFrame(outputPath, ms, 1280, 720, 1280);
        let total = 0;
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            const i = (y * frame.width + x) * 3;
            const [r, g, b] = [frame.buffer[i] as number, frame.buffer[i + 1] as number, frame.buffer[i + 2] as number];
            // Só o miolo: o canto é território da marca d'água.
            if (r > 150 && g > 150 && b < 110 && x < frame.width * 0.7) total++;
          }
        }
        return total;
      };

      // Logo grande na abertura e no encerramento, nada no meio.
      expect(await amareloCentral(700)).toBeGreaterThan(5000);
      expect(await amareloCentral(3500)).toBe(0);
      expect(await amareloCentral(5500)).toBeGreaterThan(5000);
    },
    180_000,
  );

  it("recusa montar vídeo sem imagem nenhuma em vez de gerar um arquivo vazio", async () => {
    await expect(
      new SlideshowRenderer().render({
        slides: [],
        outputPath: join(tmpdir(), "nunca.mp4"),
        workDir: tmpdir(),
        width: 1280,
        height: 720,
      }),
    ).rejects.toThrow(/sem nenhuma imagem/);
  });
});
