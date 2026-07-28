# Perspective — `perspective.analyze` + `perspective.act`

**Status: shipped, geometria clássica (não é modelo de IA).** Horizonte e
linhas verticais/keystone corrigidos de verdade; distorção de lente (barril/
pincushion) ainda não.

## O que o catálogo original pedia

docs/reference/original-docs/08 - AI Agents.md, "AI Perspective": corrigir
horizonte, linhas verticais, distorção e lente grande angular. Implementamos
os dois itens mais críticos e verificáveis — **horizonte** e **linhas
verticais/keystone** — com precisão real, cada um com seu próprio recorte
seguro. **Distorção de lente grande angular (barril/pincushion)** continua
fora do escopo: exigiria calibração de lente por câmera (parâmetros
intrínsecos específicos do modelo do dispositivo), que não temos como obter
de forma confiável a partir só do vídeo.

## Como funciona (real, verificado com ground truth)

Diferente de `room.recognize`/`object.detect` (modelos de IA treinados/
pré-treinados), tudo aqui é geometria clássica, 100% determinística:

1. **Extração de frame em escala de cinza** (`extractGrayscaleFrame.ts`) —
   preserva a proporção original (distorcer proporção distorceria o ângulo
   medido), limitado a 640px de largura para manter o custo computacional
   baixo.
2. **Detecção de bordas via operador de Sobel** (`sobelEdges.ts`) — kernels
   3x3 clássicos (Gx/Gy), sem dependência externa.
3. **Transformada de Hough** (`houghLineDetect.ts`, núcleo genérico
   `detectDominantLineTilt(edges, width, height, referenceThetaDeg, ...)`) —
   parametrização rho/theta padrão, restrita a ±45° em torno de uma
   referência, encontra a linha reta dominante por votação. Dois wrappers
   finos reutilizam o mesmo núcleo:
   * `houghHorizonDetect.ts` — referência 90° (linhas horizontais: bordas de
     piso/teto/parede).
   * `houghVerticalDetect.ts` — referência 0° (linhas verticais: quinas de
     parede, batentes de porta, cantos de móveis). A parametrização
     rho/theta dá `x ≈ rho - theta*y` perto de theta=0 — sinal oposto à
     convenção intuitiva "base desloca pra direita = tilt positivo" usada
     nos testes — por isso o wrapper inverte o sinal do resultado antes de
     devolver.
4. **Correção** (`PerspectiveActCapability.ts`) — as duas correções são
   independentes (cada uma só dispara se sua própria detecção for confiável)
   e concatenam na mesma cadeia de filtros quando ambas se aplicam:
   * **Horizonte**: rotaciona na direção oposta e recorta pela maior área
     sem cantos pretos (`rotatedRectCrop.ts` — fórmula clássica do "maior
     retângulo inscrito após rotação"), depois reescala de volta ao tamanho
     original.
   * **Linhas verticais (keystone)**: cisalhamento horizontal real via
     filtro `perspective` do FFmpeg — desloca a amostragem do topo do frame
     em relação à base por `shearPixels = -altura * tan(inclinação)`
     (`x0`/`x1` do filtro `perspective`), depois recorta a faixa de colunas
     que fica sem cantos pretos (`largura segura = largura -
     |shearPixels|`) e reescala de volta ao tamanho original. É uma
     aproximação — assume cisalhamento uniforme a partir de uma única linha
     representativa, não uma estimativa de ponto de fuga com múltiplas
     linhas (o que exigiria RANSAC sobre várias retas candidatas, fora do
     escopo desta fase).

## Verificação com ground truth exato

Fotos reais não têm um ângulo "correto" conhecido de antemão para comparar.
Em vez disso, geramos vídeos sintéticos reais via FFmpeg (filtro `geq`,
`test-support/generateTiltedTestVideo.ts` para horizonte,
`test-support/generateVerticalTiltedTestVideo.ts` para linhas verticais) com
uma borda reta em um ângulo **exatamente conhecido** (0°, ±8°, 10°, -12°,
-20°) e confirmamos que o algoritmo recupera esse ângulo com exatidão antes
de integrar — mesma disciplina de verificação usada para o preprocessamento
do YOLOX (`tools/object-detector/verify_yolox.py`) e a fórmula de recorte
foi conferida contra um resultado geométrico conhecido (quadrado rotacionado
45° → maior quadrado inscrito tem lado = lado/√2).

Para a correção de linhas verticais especificamente, o sinal de
`shearPixels` foi verificado (e corrigido) via **loop fechado**: aplicamos a
correção sobre um vídeo sintético com inclinação conhecida (8°) e rodamos a
MESMA detecção real de novo sobre o resultado — a primeira tentativa (sinal
positivo) dobrava a inclinação em vez de corrigi-la (8° → 18°); com o sinal
corrigido, o resultado corrigido mede ~0° (`RenderingEngine.test.ts`).
Também verificado de ponta a ponta através da UI real do Electron (importar
um vídeo com 6° de inclinação vertical conhecida → marcar "Nivelar
horizonte" → aplicar melhorias → confirmar que a descrição relatada contém
"linhas verticais endireitadas em 6.0°").

## Limitações e decisões de segurança conhecidas

* **Correção clampada em ±8°** (horizonte e verticais, independentemente) —
  ângulos maiores costumam indicar detecção errada (ex.: uma prateleira
  inclinada de propósito), não uma câmera realmente torta; corrigir demais
  destruiria mais imagem do que ajuda.
* **Exige uma linha dominante clara** (`peakStrength`/`verticalPeakStrength`
  mínimos, avaliados independentemente para horizonte e verticais) — cenas
  muito texturizadas (tijolo aparente, mobília cheia) sem uma borda reta
  dominante não são corrigidas nesse eixo; preferimos não corrigir a
  corrigir errado.
* **Confidence sempre 75 (`confirm`)** quando há qualquer correção — mesma
  lógica do `home_staging.act`: é uma alteração de enquadramento visível
  (recorta bordas), o usuário sempre decide se aplica.
* Roda em um único frame (o do meio do vídeo), não por cena — se a
  inclinação mudar ao longo do vídeo (câmera se move), só a inclinação do
  frame de referência é corrigida.
* **Distorção de lente grande angular (barril/pincushion) não é
  corrigida** — permanece como limitação conhecida e documentada, não uma
  omissão silenciosa.
