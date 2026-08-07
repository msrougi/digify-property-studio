import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { FFMPEG_PATH } from "../../infrastructure/ffmpeg/paths.js";
import { readVideoMetadata } from "../../infrastructure/ffmpeg/ffprobeMetadata.js";
import { extractGrayscaleFrame } from "../../infrastructure/ffmpeg/extractGrayscaleFrame.js";
import { SlideshowRenderer } from "../../infrastructure/render/SlideshowRenderer.js";
import { CreateSlideshowUseCase } from "../CreateSlideshowUseCase.js";

const execFileAsync = promisify(execFile);

async function makePhoto(path: string, color: string): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    "-y", "-f", "lavfi", "-i", `color=c=${color}:size=1600x1200`, "-frames:v", "1", path,
  ]);
}

/** PDF real montado byte a byte — o teste precisa ler um PDF de verdade. */
function writeTestPdf(path: string, linha: string): void {
  const conteudo = `BT /F1 24 Tf 60 700 Td (${linha}) Tj ET\n`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((objeto, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  writeFileSync(path, pdf, "latin1");
}

describe("CreateSlideshowUseCase", () => {
  it(
    "monta um vídeo real misturando fotos e páginas de PDF na ordem pedida",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slides-"));
      const foto1 = join(dir, "sala.png");
      const foto2 = join(dir, "quarto.png");
      const pdf = join(dir, "anuncio.pdf");
      await makePhoto(foto1, "red");
      await makePhoto(foto2, "blue");
      writeTestPdf(pdf, "Apartamento 3 quartos - R$ 850.000");

      const outputPath = join(dir, "video.mp4");
      const etapas: string[] = [];
      const resultado = await new CreateSlideshowUseCase(
        new SlideshowRenderer(),
        join(dir, "trabalho"),
      ).execute(
        {
          filePaths: [pdf, foto1, foto2],
          outputPath,
          format: "feed",
          slideDurationSec: 2.5,
        },
        (progress) => {
          if (etapas.at(-1) !== progress.stage) etapas.push(progress.stage);
        },
      );

      expect(resultado.slideCount).toBe(3);
      expect(resultado.pdfPageCount).toBe(1);
      expect(etapas).toEqual(["Preparando imagens", "Montando o vídeo"]);

      const meta = await readVideoMetadata(outputPath);
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      // 3 slides de 2,5s menos 2 transições de 0,6s.
      expect(resultado.durationSec).toBeCloseTo(6.3, 1);
      expect(meta.durationMs).toBeGreaterThan(5800);
    },
    180_000,
  );

  it(
    "respeita o formato vertical de story/reels",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slides-story-"));
      const foto = join(dir, "foto.png");
      await makePhoto(foto, "green");

      const outputPath = join(dir, "story.mp4");
      await new CreateSlideshowUseCase(new SlideshowRenderer(), join(dir, "trabalho")).execute({
        filePaths: [foto],
        outputPath,
        format: "story",
        slideDurationSec: 2,
      });

      const meta = await readVideoMetadata(outputPath);
      expect({ w: meta.width, h: meta.height }).toEqual({ w: 1080, h: 1920 });
    },
    120_000,
  );

  it(
    "usa o texto do PDF como legenda quando pedido — e não inventa legenda quando não pedido",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-slides-cap-"));
      const pdf = join(dir, "anuncio.pdf");
      writeTestPdf(pdf, "Cobertura duplex 200m2");

      const renderer = new SlideshowRenderer();
      const comLegenda = join(dir, "com.mp4");
      const semLegenda = join(dir, "sem.mp4");

      await new CreateSlideshowUseCase(renderer, join(dir, "t1")).execute({
        filePaths: [pdf],
        outputPath: comLegenda,
        slideDurationSec: 2,
        usePdfTextAsCaption: true,
      });
      await new CreateSlideshowUseCase(renderer, join(dir, "t2")).execute({
        filePaths: [pdf],
        outputPath: semLegenda,
        slideDurationSec: 2,
      });

      // A página do PDF é branca com texto preto. A legenda queimada tem
      // contorno preto sobre fundo branco, então soma pixels escuros na
      // faixa inferior — onde a página em si não tem nada.
      const faixaInferior = (buffer: Buffer, width: number, height: number): number => {
        let escuros = 0;
        for (let y = Math.floor(height * 0.82); y < height; y++) {
          for (let x = 0; x < width; x++) {
            if ((buffer[y * width + x] as number) < 100) escuros++;
          }
        }
        return escuros;
      };

      const com = await extractGrayscaleFrame(comLegenda, 1000, 1920, 1080);
      const sem = await extractGrayscaleFrame(semLegenda, 1000, 1920, 1080);

      expect(faixaInferior(com.buffer, com.width, com.height)).toBeGreaterThan(
        faixaInferior(sem.buffer, sem.width, sem.height) + 300,
      );
    },
    180_000,
  );

  it("recusa arquivo de tipo não suportado em vez de gerar vídeo quebrado", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-slides-bad-"));
    const arquivo = join(dir, "planilha.xlsx");
    writeFileSync(arquivo, "não é imagem");

    await expect(
      new CreateSlideshowUseCase(new SlideshowRenderer(), join(dir, "t")).execute({
        filePaths: [arquivo],
        outputPath: join(dir, "saida.mp4"),
      }),
    ).rejects.toThrow(/não suportado/i);
  });

  it("recusa lista vazia com mensagem clara", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digify-slides-empty-"));
    await expect(
      new CreateSlideshowUseCase(new SlideshowRenderer(), join(dir, "t")).execute({
        filePaths: [],
        outputPath: join(dir, "saida.mp4"),
      }),
    ).rejects.toThrow(/ao menos uma foto ou PDF/i);
  });
});
