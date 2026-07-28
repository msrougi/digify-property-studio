# Perspective — `perspective.analyze` + `perspective.act`

**Status: shipped, geometria clássica (não é modelo de IA).** Horizonte,
linhas verticais/keystone e distorção de lente grande angular (barril)
corrigidos de verdade.

## O que o catálogo original pedia

docs/reference/original-docs/08 - AI Agents.md, "AI Perspective": corrigir
horizonte, linhas verticais, distorção e lente grande angular. Implementamos
os três — **horizonte**, **linhas verticais/keystone** e **distorção de
lente grande angular (barril)** — com precisão real, cada um verificado
contra ground truth conhecido antes de integrar.

## Como funciona (real, verificado com ground truth)

Diferente de `room.recognize`/`object.detect` (modelos de IA treinados/
pré-treinados), tudo aqui é geometria clássica, 100% determinística:

1. **Extração de frame em escala de cinza** (`extractGrayscaleFrame.ts`) —
   preserva a proporção original (distorcer proporção distorceria o ângulo
   medido), limitado a 640px de largura para manter o custo computacional
   baixo. Aceita opcionalmente um `k1` de `lenscorrection` a aplicar antes da
   extração — usado por `detectLensDistortion.ts` pra testar candidatos.
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
4. **Distorção de lente** (`detectLensDistortion.ts`) — abordagem diferente
   das duas acima: em vez de uma fórmula analítica pra "quanto de barril tem
   essa cena", faz uma **busca real**. Testa um conjunto de candidatos de
   `k1` (correção negativa — distorção de barril, o padrão de lentes grandes
   angulares reais), aplicando de verdade o filtro `lenscorrection` do
   FFmpeg sobre o frame de referência a cada candidato e medindo se a linha
   reta dominante (mesmo Sobel+Hough acima, horizonte OU vertical) fica mais
   concentrada (`peakStrength` maior) do que sem correção nenhuma. O
   candidato vencedor só é aceito se a melhora for real (ganho mínimo de
   `peakStrength` + `peakStrength` absoluto mínimo) — senão, nenhuma
   distorção é reportada. A busca em si É a calibração: evita ter que
   reimplementar/confiar cegamente na fórmula geométrica interna do filtro
   `lenscorrection`.
5. **Correção** (`PerspectiveActCapability.ts`) — as três correções são
   independentes (cada uma só dispara se sua própria detecção for confiável)
   e concatenam na mesma cadeia de filtros quando mais de uma se aplica,
   sempre com a lente PRIMEIRO (as outras duas assumem uma câmera já
   aproximadamente linear):
   * **Distorção de lente**: aplica direto o `k1` já encontrado pela busca
     via `lenscorrection=k1=...:k2=0:i=bilinear`. Não precisa de recorte
     depois — verificado empiricamente (frame branco sólido) que corrigir
     distorção de barril com `k1` negativo nunca deixa cantos pretos (a
     reamostragem sempre fica dentro dos limites da imagem de entrada); só a
     direção oposta (pincushion, `k1` positivo) deixaria, e essa não é a
     distorção que lentes grande angulares produzem, então não é buscada.
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

Fotos reais não têm um ângulo/distorção "correto" conhecido de antemão para
comparar. Em vez disso, geramos vídeos sintéticos reais via FFmpeg:
`test-support/generateTiltedTestVideo.ts` (horizonte, filtro `geq`),
`generateVerticalTiltedTestVideo.ts` (linhas verticais, `geq`) e
`generateBarrelDistortedTestVideo.ts` (distorção de lente — uma borda reta
conhecida distorcida pelo próprio filtro real `lenscorrection` do FFmpeg com
um `k1` conhecido). Confirmamos que cada detector recupera o ground truth
(ângulo exato para horizonte/verticais: 0°, ±8°, 10°, -12°, -20°; correção
de `k1` que de fato melhora `peakStrength` para lente, com `k1Forward` 0.20
e 0.30) antes de integrar — mesma disciplina usada no preprocessamento do
YOLOX (`tools/object-detector/verify_yolox.py`). A fórmula de recorte de
horizonte foi conferida contra um resultado geométrico conhecido (quadrado
rotacionado 45° → maior quadrado inscrito tem lado = lado/√2).

Para a correção de linhas verticais especificamente, o sinal de
`shearPixels` foi verificado (e corrigido) via **loop fechado**: aplicamos a
correção sobre um vídeo sintético com inclinação conhecida (8°) e rodamos a
MESMA detecção real de novo sobre o resultado — a primeira tentativa (sinal
positivo) dobrava a inclinação em vez de corrigi-la (8° → 18°); com o sinal
corrigido, o resultado corrigido mede ~0° (`RenderingEngine.test.ts`).

Para distorção de lente, o mapeamento de "quanto de barril" → "qual `k1` de
correção" também foi validado empiricamente antes de virar código: aplicamos
`lenscorrection` com vários `k1` de distorção conhecidos (0.10 a 0.30) sobre
uma grade sintética, testamos qual `k1` de correção de fato zera a curvatura
medida (rastreando uma linha via continuidade, técnica de calibração — não
código de produção), e confirmamos que o `k1` de correção é **independente
da resolução do frame** (testado a 640×480 e 1280×960: mesmo `k1` ótimo nas
duas escalas) — por isso a busca real em `detectLensDistortion.ts` funciona
sobre o frame normalizado (~640px) e o `k1` encontrado é aplicado direto no
render final em resolução original, sem precisar escalar o valor.

Tudo isso também verificado de ponta a ponta através da UI real do Electron
(importar um vídeo sintético com distorção/inclinação conhecida → marcar
"Nivelar horizonte" → aplicar melhorias → confirmar que a descrição relatada
contém o texto esperado para cada correção).

## Limitações e decisões de segurança conhecidas

* **Correção clampada** — horizonte/verticais em ±8° (ângulos maiores
  costumam indicar detecção errada, ex. uma prateleira inclinada de
  propósito, não uma câmera realmente torta); lente em ±0.35 de `k1` (mesmo
  limite da busca, defesa em profundidade). Corrigir demais destruiria mais
  imagem/introduziria mais distorção do que ajuda.
* **Exige uma linha dominante clara** (`peakStrength`/`verticalPeakStrength`
  mínimos pra horizonte/verticais; ganho mínimo de `peakStrength` sobre não
  corrigir nada pra lente) — cenas muito texturizadas (tijolo aparente,
  mobília cheia) sem uma borda reta dominante não são corrigidas nesse eixo;
  preferimos não corrigir a corrigir errado. Na prática isso significa que
  cenas cluttered reais (muitos móveis/textura) podem legitimamente não
  disparar nenhuma correção, mesmo com alguma distorção real presente — os
  testes automatizados usam conteúdo sintético limpo (mesmo padrão dos
  testes de horizonte/verticais) porque é o único jeito de ter um ground
  truth exato pra verificar contra.
* A busca de distorção de lente testa um **conjunto discreto** de candidatos
  de `k1` (passo de 0.05), não resolve o valor exato por otimização
  contínua — suficiente pra reduzir a distorção visivelmente, não
  necessariamente o `k1` matematicamente ótimo.
* **Confidence sempre 75 (`confirm`)** quando há qualquer correção — mesma
  lógica do `home_staging.act`: é uma alteração de enquadramento/geometria
  visível, o usuário sempre decide se aplica.
* Roda em um único frame (o do meio do vídeo), não por cena — se a
  inclinação/distorção mudar ao longo do vídeo (câmera se move, zoom óptico
  muda a distorção), só o frame de referência é usado pra calibrar a
  correção aplicada ao vídeo inteiro.
* **Distorção de lente pincushion (o oposto do barril, mais rara — geralmente
  de zoom teleobjetiva, não de lente grande angular) não é buscada** — só a
  direção de correção que não deixa cantos pretos (barril) é testada,
  seguindo o escopo original do catálogo ("lente grande angular").
