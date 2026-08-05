import type { Box } from "./unionBoxWithMargin.js";

export interface ClutterRegion extends Box {
  /** Score médio de textura (magnitude de Sobel) da região — maior = destoa mais do resto do frame. */
  textureScore: number;
}

const GRID_COLS = 24;
const GRID_ROWS = 18;
/**
 * Limiar em "modified Z-score" (estatística robusta baseada em
 * mediana/MAD — Iglewicz & Hoaglin, o valor 3.5 é o recomendado na
 * literatura pra esse método). Escolhido no lugar de média+desvio-padrão
 * de propósito: um quarto com bagunça SEVERA (chão majoritariamente
 * coberto) faz a bagunça deixar de ser uma minoria pequena da imagem —
 * com média+desvio-padrão comuns, isso "puxa" a própria média/desvio pra
 * cima e o limiar fica alto demais pra pegar a própria bagunça que o
 * inflou (bug real encontrado testando com um retângulo cobrindo ~30% do
 * frame: nada era detectado). Mediana/MAD são robustas a até ~50% de
 * "contaminação" nos dados — continuam representando o fundo típico
 * mesmo com bastante bagunça real presente.
 */
const MODIFIED_ZSCORE_THRESHOLD = 5;
/** Fator padrão que torna o MAD comparável ao desvio-padrão pra uma distribuição normal (1/Φ⁻¹(0.75) ≈ 1.4826). */
const MAD_TO_STDDEV_FACTOR = 1.4826;
/**
 * Quando o "fundo" da imagem é PERFEITAMENTE uniforme (comum em vídeo
 * comprimido — uma região de cor sólida sai idêntica pixel a pixel), o MAD
 * fica exatamente 0: mais da metade das células bate exatamente com a
 * mediana. O modified Z-score não é calculável nesse caso (divisão por
 * ~0) — mas isso NÃO significa "nada destoa", significa o oposto: com
 * tolerância zero no "normal", qualquer célula diferente já é uma anomalia
 * real. Bug real encontrado: o bail-out antigo (`mad < epsilon` -> retorna
 * vazio) rejeitava até bagunça óbvia sempre que o fundo saía perfeitamente
 * uniforme do FFmpeg. Esse limiar absoluto (escala de magnitude de Sobel)
 * é o fallback só pra esse caso degenerado.
 */
const ABSOLUTE_ANOMALY_FALLBACK = 60;
/** Região conectada de 1-2 células só é ruído (reflexo, ruído de sensor, ou falso positivo estatístico) — exige pelo menos isso pra virar candidato real. */
const MIN_REGION_CELLS = 3;
/**
 * Só um freio de segurança pro caso degenerado (quase o frame inteiro
 * marcado) — NÃO é o mecanismo principal contra padrão de superfície
 * uniforme (piso/parede texturizado). Esse caso já é resolvido pela
 * própria estatística: um padrão que cobre o frame inteiro tem MAD baixo
 * (todas as células parecidas entre si), então nada passa do modified
 * Z-score — testado com xadrez cobrindo o frame inteiro. Um valor baixo
 * aqui (testado originalmente com 0.35, com média+desvio-padrão) rejeitava
 * bagunça real e severa (chão praticamente todo coberto de roupa/caixas,
 * como no caso real que motivou este algoritmo) — exatamente o oposto do
 * que deveria filtrar.
 */
const MAX_REGION_AREA_RATIO = 0.85;

const SOBEL_GX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_GY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

/**
 * Detecção de bagunça genérica por anomalia visual — matemática clássica
 * (Sobel + estatística), não um modelo de IA. Motivo real de existir: o
 * YOLOX/COCO (`object.detect`) só reconhece 80 tipos específicos de objeto
 * (garrafa, mochila, cadeira...) — não tem categoria nenhuma pra "monte de
 * roupa no chão" ou "bagunça genérica", que é boa parte do que aparece em
 * vídeos reais de imóvel bagunçado (confirmado com uma foto real de usuário:
 * zero objetos COCO reconhecíveis, mas a bagunça visualmente óbvia pra
 * qualquer pessoa).
 *
 * Em vez de tentar reconhecer "o que é" cada item, mede o que **destoa
 * visualmente** do resto do frame: divide em uma grade, calcula a
 * intensidade média de borda (Sobel) por célula, e flags células com
 * modified Z-score (mediana/MAD, não média/desvio-padrão — ver
 * `MODIFIED_ZSCORE_THRESHOLD`) significativo DESTE frame específico (nunca
 * um limiar fixo global — um frame mais texturizado no geral naturalmente
 * exige mais contraste local pra contar como "destoa").
 *
 * `excludeBoxes` (pessoas, móveis/eletrodomésticos fixos já detectados por
 * `object.detect`) nunca vira candidato a remoção, não importa o quão
 * "texturizado" pareça — proteção de segurança, não uma otimização.
 */
export function detectClutterRegions(
  buffer: Buffer,
  width: number,
  height: number,
  excludeBoxes: Box[] = [],
): ClutterRegion[] {
  const cellWidth = Math.max(2, Math.floor(width / GRID_COLS));
  const cellHeight = Math.max(2, Math.floor(height / GRID_ROWS));
  const cols = Math.floor(width / cellWidth);
  const rows = Math.floor(height / cellHeight);

  const cellScores = computeCellTextureScores(buffer, width, height, cols, rows, cellWidth, cellHeight);
  const median = computeMedian(cellScores);
  const mad = computeMedian(cellScores.map((score) => Math.abs(score - median)));

  // MAD ~0 (fundo perfeitamente uniforme, comum em vídeo comprimido) quebra
  // o modified Z-score (divisão por ~0) — mas só significa "nada destoa"
  // quando NEM o próprio máximo destoa em magnitude absoluta. Caso
  // contrário (tolerância zero no "normal" + existe algo bem diferente),
  // cai pro limiar absoluto em vez de simplesmente desistir.
  const maxScore = Math.max(...cellScores);
  if (mad < 1e-6 && maxScore - median < ABSOLUTE_ANOMALY_FALLBACK) return [];

  const flagged = flagAnomalousCells(cellScores, cols, rows, median, mad, excludeBoxes, cellWidth, cellHeight);
  const components = findConnectedComponents(flagged, cols, rows);

  const frameArea = width * height;
  const regions: ClutterRegion[] = [];
  for (const component of components) {
    if (component.length < MIN_REGION_CELLS) continue;

    let minCol = Infinity;
    let minRow = Infinity;
    let maxCol = -Infinity;
    let maxRow = -Infinity;
    let scoreSum = 0;
    for (const { col, row } of component) {
      minCol = Math.min(minCol, col);
      minRow = Math.min(minRow, row);
      maxCol = Math.max(maxCol, col);
      maxRow = Math.max(maxRow, row);
      scoreSum += cellScores[row * cols + col] as number;
    }

    const x = minCol * cellWidth;
    const y = minRow * cellHeight;
    const boxWidth = (maxCol - minCol + 1) * cellWidth;
    const boxHeight = (maxRow - minRow + 1) * cellHeight;

    if ((boxWidth * boxHeight) / frameArea > MAX_REGION_AREA_RATIO) continue;

    regions.push({ x, y, width: boxWidth, height: boxHeight, textureScore: scoreSum / component.length });
  }

  return regions;
}

function computeCellTextureScores(
  buffer: Buffer,
  width: number,
  height: number,
  cols: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
): number[] {
  const cellSums = new Array(cols * rows).fill(0) as number[];
  const cellCounts = new Array(cols * rows).fill(0) as number[];

  for (let y = 1; y < height - 1; y++) {
    const row = Math.min(rows - 1, Math.floor(y / cellHeight));
    for (let x = 1; x < width - 1; x++) {
      const col = Math.min(cols - 1, Math.floor(x / cellWidth));
      let sumX = 0;
      let sumY = 0;
      let kernelIndex = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = buffer[(y + ky) * width + (x + kx)] as number;
          sumX += pixel * (SOBEL_GX[kernelIndex] as number);
          sumY += pixel * (SOBEL_GY[kernelIndex] as number);
          kernelIndex++;
        }
      }
      const magnitude = Math.sqrt(sumX * sumX + sumY * sumY);
      const cellIndex = row * cols + col;
      cellSums[cellIndex] = (cellSums[cellIndex] as number) + magnitude;
      cellCounts[cellIndex] = (cellCounts[cellIndex] as number) + 1;
    }
  }

  return cellSums.map((sum, i) => (cellCounts[i] ? sum / (cellCounts[i] as number) : 0));
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

function flagAnomalousCells(
  cellScores: number[],
  cols: number,
  rows: number,
  median: number,
  mad: number,
  excludeBoxes: Box[],
  cellWidth: number,
  cellHeight: number,
): boolean[] {
  const flagged = new Array(cols * rows).fill(false) as boolean[];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const score = cellScores[index] as number;

      if (mad < 1e-6) {
        // MAD ~0: modified Z-score não é calculável — usa magnitude
        // absoluta (ver `ABSOLUTE_ANOMALY_FALLBACK`).
        if (score - median <= ABSOLUTE_ANOMALY_FALLBACK) continue;
      } else {
        // Modified Z-score (Iglewicz & Hoaglin) — só o lado "acima da
        // mediana" interessa aqui (célula MENOS texturizada que o típico
        // nunca é candidata a bagunça).
        const modifiedZScore = (MAD_TO_STDDEV_FACTOR * (score - median)) / mad;
        if (modifiedZScore <= MODIFIED_ZSCORE_THRESHOLD) continue;
      }

      const cellCenterX = col * cellWidth + cellWidth / 2;
      const cellCenterY = row * cellHeight + cellHeight / 2;
      const isExcluded = excludeBoxes.some(
        (box) =>
          cellCenterX >= box.x &&
          cellCenterX <= box.x + box.width &&
          cellCenterY >= box.y &&
          cellCenterY <= box.y + box.height,
      );
      if (!isExcluded) flagged[index] = true;
    }
  }
  return flagged;
}

function findConnectedComponents(
  flagged: boolean[],
  cols: number,
  rows: number,
): { col: number; row: number }[][] {
  const visited = new Array(cols * rows).fill(false) as boolean[];
  const components: { col: number; row: number }[][] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      if (!flagged[index] || visited[index]) continue;

      const component: { col: number; row: number }[] = [];
      const stack = [{ col, row }];
      visited[index] = true;

      while (stack.length > 0) {
        const current = stack.pop() as { col: number; row: number };
        component.push(current);

        const neighbors = [
          { col: current.col - 1, row: current.row },
          { col: current.col + 1, row: current.row },
          { col: current.col, row: current.row - 1 },
          { col: current.col, row: current.row + 1 },
        ];
        for (const neighbor of neighbors) {
          if (neighbor.col < 0 || neighbor.col >= cols || neighbor.row < 0 || neighbor.row >= rows) continue;
          const neighborIndex = neighbor.row * cols + neighbor.col;
          if (!flagged[neighborIndex] || visited[neighborIndex]) continue;
          visited[neighborIndex] = true;
          stack.push(neighbor);
        }
      }

      components.push(component);
    }
  }

  return components;
}
