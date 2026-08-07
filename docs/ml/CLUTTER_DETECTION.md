# Detecção de bagunça genérica — `clutter.detect`

**Status: shipped — heurística clássica de visão computacional (Sobel +
estatística robusta), não um modelo de IA. Complementa `object.detect`
(YOLOX/COCO), não o substitui.**

## O problema real que motivou isso

Um usuário testou o app com um vídeo real de um quarto visivelmente
bagunçado (roupa amontoada no chão, caixas, papéis, sacolas) e o Property
Score voltou 100/100, "0 objeto(s) detectado(s)". Investigado com uma foto
real enviada pelo usuário: o COCO (as 80 classes que o YOLOX reconhece,
ver `docs/ml/OBJECT_DETECTION.md`) simplesmente **não tem categoria
nenhuma** pra "monte de roupa no chão" — só reconhece tipos específicos e
bem definidos de objeto (garrafa, mochila, cadeira...). Baixar o limiar de
confiança do YOLOX não resolveria isso: não é um problema de sensibilidade,
é a ausência total de uma classe correspondente no vocabulário do modelo.

## A ideia: não tentar reconhecer "o que é", medir o que destoa

Em vez de classificar objetos, `detectClutterRegions.ts` mede **anomalia
visual local**: divide o frame numa grade (24x18 células), calcula a
intensidade média de borda (Sobel, a mesma matemática clássica usada em
`sobelEdges.ts` pra outras features) por célula, e flags células que
destoam estatisticamente do resto do frame — sem nenhum limiar fixo
global, sempre relativo a cada frame específico (um cômodo mais
texturizado no geral naturalmente exige mais contraste local pra contar
como "diferente").

## Por que mediana/MAD e não média/desvio-padrão

A primeira versão usava média + `K`×desvio-padrão (limiar clássico de
outlier). Funcionava em testes com bagunça pequena, mas **falhava
justamente no caso mais importante**: bagunça severa cobrindo boa parte do
chão. Motivo real: quando a "anomalia" deixa de ser uma minoria pequena da
imagem (ex.: 30%+ do frame), ela passa a **puxar a própria média e o
desvio-padrão pra cima**, inflando o limiar até um ponto que nem a própria
bagunça que causou a inflação consegue ultrapassar — confirmado
isolando a variável: um retângulo cobrindo ~31% de um frame de teste real
não gerava nenhuma detecção com média/desvio-padrão, mas gerava com
mediana/MAD (median absolute deviation).

**Fix**: `modified Z-score` (Iglewicz & Hoaglin) baseado em mediana/MAD —
estatisticamente robusto a até ~50% de "contaminação" nos dados, continua
representando o fundo típico do cômodo mesmo com bastante bagunça real
presente. `MODIFIED_ZSCORE_THRESHOLD = 5` foi calibrado testando contra
ruído puro (várias seeds determinísticas) pra manter falsos positivos
baixos sem perder sensibilidade a bagunça real.

### Caso degenerado real: MAD exatamente 0

Vídeo comprimido (H264/yuv420p) frequentemente produz um fundo
**perfeitamente uniforme** pixel a pixel numa região de cor sólida — nesse
caso o MAD fica exatamente 0 (mais da metade das células bate exatamente
com a mediana), e o modified Z-score não é calculável (divisão por ~0).
Isso NÃO significa "nada destoa" — significa o oposto: com tolerância zero
no "normal", qualquer célula diferente já é uma anomalia real. Bug real
encontrado e corrigido: o bail-out original (`mad ~0` → retorna vazio)
rejeitava até bagunça óbvia sempre que o fundo saía perfeitamente uniforme
do FFmpeg. Fix: nesse caso específico, cai pro limiar absoluto
`ABSOLUTE_ANOMALY_FALLBACK` (magnitude de Sobel, não uma razão) — o
`mad < epsilon` isolado não basta, o retorno vazio só acontece quando NEM o
próprio máximo do frame destoa em magnitude absoluta.

## Segurança: nunca toca pessoas nem móveis/eletrodomésticos fixos

`excludeBoxes` recebe as caixas já detectadas por `object.detect`
(pessoas, animais, móveis/eletrodomésticos fixos) — qualquer célula cujo
centro caia dentro de uma dessas caixas nunca vira candidato a remoção,
não importa o quão "texturizada" pareça. Proteção de segurança, não uma
otimização — relevante porque os vídeos reais desse usuário mostram
pessoas andando pela casa durante a filmagem.

## Área máxima de uma região: freio de segurança, não o mecanismo principal

`MAX_REGION_AREA_RATIO = 0.85` existe só pro caso degenerado (quase o
frame inteiro marcado) — o mecanismo principal contra padrão de superfície
uniforme (piso/parede texturizado de verdade) já é a própria estatística
(testado com um xadrez cobrindo o frame inteiro: MAD baixo entre células,
nada passa do modified Z-score). Um valor baixo aqui (testado
originalmente com 0.35) rejeitava bagunça real e severa — exatamente o
oposto do que deveria filtrar.

## Gate: só roda em cenas indoor reconhecidas com confiança razoável

O classificador de ambiente (`room.recognize`) só sabe reconhecer
`bathroom`/`bedroom`/`kitchen` (ver `docs/ml/ROOM_CLASSIFIER.md`) — não
tem categoria "área externa" nenhuma, então é **forçado** a escolher uma
dessas 3 mesmo pra um jardim ou varanda. Área externa tem textura
naturalmente "bagunçada" (grama, plantas, terra) — rodar a heurística de
textura lá dispararia falsos positivos o tempo todo.

**Fix real, mas admitidamente aproximado**: `DetectObjectsUseCase` só roda
`clutter.detect` quando `scene.roomConfidence >= 40` — não é um detector de
"área externa" de verdade (não existe um hoje), é a melhor aproximação
disponível com o que já existe: um ambiente que não se encaixa bem em
nenhuma das 3 classes conhecidas tende a ter uma confiança de classificação
mais baixa. Isso pode falhar (um classificador confiante e errado passa
pelo gate) — documentado honestamente como limitação, não escondido.

## Multi-frame, igual `object.detect`

Roda em 5 frames espalhados pela cena (mesmo raciocínio de
`ObjectDetectCapability` — bagunça pode não estar visível em um único
frame), fundindo regiões que se sobrepõem entre frames diferentes (evita
duplicar o mesmo item físico várias vezes na lista de objetos removíveis).

## Verificação feita

* `detectClutterRegions.test.ts`: buffers sintéticos — não encontra nada
  num frame uniforme; detecta um retângulo real de alto contraste; nunca
  marca uma caixa excluída; ignora um padrão que cobre o frame inteiro;
  8 seeds diferentes de ruído puro confirmando baixo falso positivo.
* `ClutterDetectCapability.test.ts`: vídeo real gerado via FFmpeg (`geq`,
  nunca um arquivo fake) — detecta a região real, respeita exclusão,
  não encontra nada num vídeo limpo.
* `DetectObjectsUseCase.test.ts`: teste de integração reproduzindo o bug
  real relatado (bagunça sem classe COCO, não achada por `object.detect`,
  encontrada por `clutter.detect` numa cena indoor confiante) + teste do
  gate (nunca roda `clutter.detect` sem reconhecimento de ambiente
  confiante — registrado de um jeito que quebraria com "Capability não
  encontrada" se o gate falhasse, não só filtraria o resultado).

## Limitações honestas

* O gate de "indoor confiante" é uma aproximação (ver acima) — pode deixar
  passar área externa classificada erroneamente com confiança alta, ou
  bloquear um cômodo indoor legítimo classificado com baixa confiança.
* É uma heurística de textura, não reconhecimento — não sabe "o que" é a
  bagunça, só que aquela região destoa visualmente do resto. Confidence
  sempre moderada (60) por causa disso, sempre exige confirmação do
  usuário antes de aplicar a remoção (mesma lógica de `perspective.act`/
  `reflection.act`/`home_staging.act`).
* Regiões grandes (chão majoritariamente coberto) dependem da qualidade da
  reconstrução, documentada em `docs/ml/HOME_STAGING.md` — este algoritmo
  só decide "onde", não "como remover melhor".

## Este algoritmo NÃO é usado pra apagar nada

Importante, porque já foi: `detectClutterRegions` alimenta apenas o
**relatório** (lista de itens e Property Score). Ele não decide mais o que
sai do vídeo.

Uma versão do `FrameByFrameCleaner` usava esta mesma heurística pra escolher
o que apagar. Testada nos vídeos reais, ela **borrou a coifa, apagou o
lustre e a planta, e sujou o backsplash** — em cômodos que não tinham
bagunça nenhuma. O motivo é estrutural: anomalia de textura significa, na
prática, "o que não for parede lisa", e num vídeo imobiliário isso é a
mobília e os acabamentos. Nenhum limiar conserta, porque o algoritmo não
sabe *o que* a coisa é.

Hoje quem decide o que apagar é o YOLOX, por classe COCO — ver
`docs/ml/HOME_STAGING.md`. A regra virou: **medir textura serve pra
apontar; só reconhecimento semântico autoriza destruir pixel.**

## Por que o relatório não ficou em 5,0

Foi o 5,0 que produziu o "100/100, 0 objetos detectados" num vídeo
visivelmente bagunçado. Medido nas três amostras reais de cômodo com esse
limiar: **0, 0 e 1 região** — o relatório dizia "nada pra tirar" em cômodos
que o usuário via como sujos.

Baixar o limiar sozinho não resolvia, porque ruído puro de sensor começa a
disparar exatamente na mesma faixa (8 seeds determinísticas, ruído
uniforme de amplitude 15, regiões falsas por quadro):

| limiar | falsos positivos por seed |
|--------|---------------------------|
| 5,0    | 0, 0, 0, 0, 0, 0, 0, 0    |
| 4,0    | 1, 0, 0, 0, 0, 1, 1, 0    |
| 3,5    | 1, 0, 0, 1, 1, 1, 2, 0    |
| 3,0    | 2, 1, 0, 1, 1, 1, 4, 0    |
| 2,5    | 4, 2, 2, 2, 3, 5, 7, 1    |

O que separa os dois casos não é a intensidade, é a **persistência**:
bagunça física fica parada no mesmo lugar, ruído pula de lugar a cada
quadro. `clutter.detect` já amostrava 5 frames por cena — passou a exigir
que pelo menos 2 frames distintos concordem sobre o mesmo lugar
(`MIN_FRAMES_CONFIRMING`). Com isso o relatório passou de **0/0/1** para
**4/4/3** regiões nas mesmas amostras reais, sem abrir a porta pro ruído.

Coberto por teste real: dois vídeos com a MESMA textura no MESMO lugar,
um com a mancha o vídeo inteiro e outro só numa janela de 0,1s (que cai em
cima de um único instante de amostragem). O primeiro é relatado, o segundo
não.
