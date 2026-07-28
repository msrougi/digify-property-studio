# Perspective — `perspective.analyze` + `perspective.act`

**Status: shipped, geometria clássica (não é modelo de IA).**

## O que o catálogo original pedia

docs/reference/original-docs/08 - AI Agents.md, "AI Perspective": corrigir
horizonte, linhas verticais, distorção e lente grande angular. Implementamos
o item mais crítico e mais verificável — **horizonte** — com precisão real.
Linhas verticais/distorção de lente grande angular ficam para uma iteração
futura (exigem calibração de lente por câmera, fora do escopo desta fase).

## Como funciona (real, verificado com ground truth)

Diferente de `room.recognize`/`object.detect` (modelos de IA treinados/
pré-treinados), horizonte é geometria clássica, 100% determinística:

1. **Extração de frame em escala de cinza** (`extractGrayscaleFrame.ts`) —
   preserva a proporção original (distorcer proporção distorceria o ângulo
   medido), limitado a 640px de largura para manter o custo computacional
   baixo.
2. **Detecção de bordas via operador de Sobel** (`sobelEdges.ts`) — kernels
   3x3 clássicos (Gx/Gy), sem dependência externa.
3. **Transformada de Hough** (`houghHorizonDetect.ts`) — parametrização
   rho/theta padrão, restrita a ±45° da horizontal (não nos interessa achar
   paredes verticais), encontra a linha reta dominante por votação.
4. **Correção** (`PerspectiveActCapability.ts`) — rotaciona na direção
   oposta e recorta pela maior área sem cantos pretos
   (`rotatedRectCrop.ts` — fórmula clássica do "maior retângulo inscrito
   após rotação", o mesmo resultado geométrico usado por ferramentas de
   "auto-crop depois de endireitar horizonte"), depois reescala de volta ao
   tamanho original.

## Verificação com ground truth exato

Fotos reais não têm um ângulo "correto" conhecido de antemão para comparar.
Em vez disso, geramos vídeos sintéticos reais via FFmpeg (filtro `geq`,
`test-support/generateTiltedTestVideo.ts`) com uma borda reta em um ângulo
**exatamente conhecido** (0°, 10°, -20°) e confirmamos que o algoritmo
recupera esse ângulo com exatidão antes de integrar — mesma disciplina de
verificação usada para o preprocessamento do YOLOX
(`tools/object-detector/verify_yolox.py`) e a fórmula de recorte foi
conferida contra um resultado geométrico conhecido (quadrado rotacionado 45°
→ maior quadrado inscrito tem lado = lado/√2).

## Limitações e decisões de segurança conhecidas

* **Correção clampada em ±8°** — ângulos maiores costumam indicar detecção
  errada (ex.: uma prateleira inclinada de propósito), não uma câmera
  realmente torta; corrigir demais destruiria mais imagem do que ajuda.
* **Exige uma linha dominante clara** (`peakStrength` mínimo) — cenas muito
  texturizadas (tijolo aparente, mobília cheia) sem uma borda reta dominante
  não são corrigidas; preferimos não corrigir a corrigir errado.
* **Confidence sempre 75 (`confirm`)** quando há correção — mesma lógica do
  `home_staging.act`: é uma alteração de enquadramento visível (recorta
  bordas), o usuário sempre decide se aplica.
* Roda em um único frame (o do meio do vídeo), não por cena — se o horizonte
  mudar de inclinação ao longo do vídeo (câmera se move), só a inclinação do
  frame de referência é corrigida.
