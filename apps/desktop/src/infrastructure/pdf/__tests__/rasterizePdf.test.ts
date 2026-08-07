import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readVideoMetadata } from "../../ffmpeg/ffprobeMetadata.js";
import { rasterizePdf } from "../rasterizePdf.js";

/**
 * Escreve um PDF real, montado byte a byte (sem biblioteca de geração) — o
 * ponto do teste é ler um PDF de verdade, então fabricá-lo com o mesmo
 * pacote que o lê provaria menos.
 */
function writeTestPdf(path: string, linhas: string[]): void {
  const conteudo = linhas
    .map((linha, i) => `BT /F1 22 Tf 60 ${740 - i * 40} Td (${linha}) Tj ET\n`)
    .join("");
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

describe("rasterizePdf", () => {
  it(
    "rasteriza a página em PNG utilizável e extrai o texto do anúncio",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-pdf-"));
      const pdfPath = join(dir, "anuncio.pdf");
      writeTestPdf(pdfPath, [
        "Apartamento 3 quartos - Vila Mariana",
        "120 m2 - 2 vagas",
        "R$ 850.000",
      ]);

      const pages = await rasterizePdf(pdfPath, dir, 1080);

      expect(pages).toHaveLength(1);
      const page = pages[0] as (typeof pages)[number];

      // Altura pedida respeitada e proporção A4 preservada (595x842).
      expect(page.height).toBe(1080);
      expect(page.width).toBeCloseTo((595 / 842) * 1080, 0);

      // PNG real no disco, não um arquivo vazio.
      expect(statSync(page.imagePath).size).toBeGreaterThan(1000);
      // O FFprobe lê o PNG — prova que é uma imagem válida, não bytes soltos.
      const probe = await readVideoMetadata(page.imagePath);
      expect(probe.width).toBe(page.width);
      expect(probe.height).toBe(page.height);

      // O texto é o que vira legenda automática do vídeo.
      expect(page.text).toContain("Apartamento 3 quartos");
      expect(page.text).toContain("R$ 850.000");
    },
    60_000,
  );

  it(
    "trata cada página como um slide próprio",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "digify-pdf-multi-"));
      const pdfPath = join(dir, "duas.pdf");
      // Mesmo gerador, duas páginas: exercita o laço e a nomeação dos PNGs.
      const conteudo = "BT /F1 24 Tf 60 700 Td (Pagina) Tj ET\n";
      const objetos = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${conteudo.length} >>\nstream\n${conteudo}endstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
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
      writeFileSync(pdfPath, pdf, "latin1");

      const pages = await rasterizePdf(pdfPath, dir, 720);
      expect(pages).toHaveLength(2);
      expect(new Set(pages.map((p) => p.imagePath)).size).toBe(2);
      for (const page of pages) expect(statSync(page.imagePath).size).toBeGreaterThan(500);
    },
    60_000,
  );
});
