# Reflection — `reflection.analyze` / `reflection.act`

**Status: shipped — algoritmo clássico real (não é modelo de IA), com uma
limitação honesta importante: reduz reflexo/brilho difuso em toda a cena,
não segmenta/localiza uma superfície reflexiva específica.**

## O que o catálogo original pedia

docs/reference/original-docs/08 - AI Agents.md: detectar superfícies
reflexivas e objetos indesejados refletidos (equipe/tripé aparecendo em um
espelho, por exemplo).

## Por que isso não é como `object.detect`

O COCO (base do `object.detect`, 80 classes) não tem classe "espelho"/
"vidro"/"superfície reflexiva" — isso não é um objeto comum de foto do
dia a dia, é uma categoria de nicho de pesquisa acadêmica em visão
computacional (segmentação de espelhos/vidro, ou remoção de reflexo em
imagem única). Precisaríamos de um modelo treinado especificamente para
essa tarefa — ou, como acabou sendo o caminho real, um algoritmo clássico
que ataca o problema por outro ângulo (literalmente).

## Primeira rodada — segmentação de espelho/vidro (bloqueada por hospedagem)

| Modelo/Dataset | O que é | Onde os pesos ficam | Resultado |
|---|---|---|---|
| MirrorNet (ICCV 2019) | Segmentação de espelhos, backbone ResNeXt | Google Drive | ❌ Bloqueado |
| memgonzales/mirror-segmentation (WSCG 2023) | CNN leve p/ espelhos (EfficientNetV2), BSD-3 | Google Drive | ❌ Bloqueado |
| GDNet (CVPR 2020) | Detecção de vidro | Página do projeto + Google Drive (backbone) | ❌ Bloqueado |
| 3DRef (EBLNet/PCSeg/SATNet) | Dataset+modelos de reflexão 3D | Página do projeto (403 mesmo via HTTPS direto) | ❌ Bloqueado |
| CSAILVision/semantic-segmentation-pytorch | Segmentação ADE20K (150 classes, inclui "mirror") | Servidor próprio do MIT CSAIL | ❌ Bloqueado |
| ONNX Model Zoo (`onnx/models`) | Segmentação (FCN/DUC/Mask-RCNN) | GitHub — acessível | ✅ Acessível, mas nenhum modelo treinado em ADE20K/Objects365 tem classe de espelho/vidro |
| Objects365 (365 classes, inclui "Mirror") | Dataset com a classe certa | — | Ultralytics/OpenMMLab confirmam publicamente que não vão liberar pesos treinados nele |

## Segunda rodada — modelos de reflection removal (um candidato acessível, testado e reprovado)

| Candidato | O que é | Onde os pesos ficam | Resultado |
|---|---|---|---|
| WZH0120/SAM2-UNet | Framework genérico (SAM2 encoder) avaliado em mirror detection | Google Drive + backbone SAM2 em `dl.fbaipublicfiles.com` | ❌ Bloqueado |
| chengqianyu03/AAAI26-MSNet | Detecção de superfície de vidro | Google Drive + SAM em `dl.fbaipublicfiles.com` | ❌ Bloqueado |
| hainuo-wang/XReflection (DSRNet/DSIT/RDNet, Apache 2.0) | Toolbox de reflection removal com benchmarks publicados | Servidor próprio (`checkpoints.mingjia.li`) | ❌ Bloqueado — confirmado via `curl` direto (403 no CONNECT) |
| zhuyr97/Reflection_RemoVal_CVPR2024, zdlarr/Location-aware-SIRR | Reflection removal acadêmico | Google Drive | ❌ Bloqueado |
| PINTO0309/reflection-removal (MIT) | Reflection removal via DINOv3 + GAN leve, ONNX pronto | GitHub Releases — acessível | ✅ Baixado e testado de verdade — **reprovado no teste empírico** (MSE contra ground truth sintético piorou em todas as 6 combinações testadas — modelo WIP, o próprio autor avisa que qualidade não é o objetivo do projeto) |

## Terceira rodada — algoritmo clássico real (sem modelo treinado)

Depois de reprovar o único candidato de IA acessível, mudamos de categoria:
em vez de segmentação de espelho ou um modelo generativo, existe uma linha
de pesquisa clássica de processamento de sinal — **supressão de reflexo em
imagem única via otimização convexa** — que não depende de pesos treinados
nenhuns, só matemática determinística (mesma categoria de
`houghLineDetect.ts`/`detectLensDistortion.ts`).

Implementamos o método de **Yang, Ma, Zheng, Cai & Xu, "Fast Single Image
Reflection Suppression via Convex Optimization" (CVPR 2019)** — porte
próprio, linha a linha, do código MATLAB oficial dos autores
(`github.com/yyhz76/reflectSuppress`, lido diretamente do GitHub pra
garantir fidelidade ao algoritmo publicado, não uma reconstrução de
memória).

### Como funciona (real, verificado)

1. **Limiarização de gradiente** — para cada canal de cor, calcula o
   gradiente (`grad`, diferenças-progressivas com contorno replicado) e
   zera os gradientes fracos (`|∇I| ≤ h`, `h=0.033`, mesmo valor do paper).
   A premissa: reflexos/brilho difuso tendem a ter gradiente baixo (bordas
   suaves, fora de foco); a cena real tende a ter gradiente alto (bordas
   nítidas).
2. **Laplaciano da divergência do gradiente esparso** — `L(div(δ_h(I)))`,
   onde `δ_h` é o campo de gradiente já limiarizado. Isso reconstrói um
   "laplaciano" que só enxerga as bordas fortes.
3. **Resolve de volta pra uma imagem** cujo laplaciano bate com esse alvo
   esparso, via a equação `(L² + ε·I)·T = L(div(δ_h(I))) + ε·I` — resolvida
   **no domínio da frequência via DCT-II/DCT-III** (`dct2d.ts`, implementação
   própria, base de cossenos ortonormal pré-computada e cacheada por
   tamanho — não recalcula `Math.cos` por elemento a cada linha/coluna, que
   era o gargalo real de uma primeira versão ingênua).

### Verificação (a mesma disciplina do resto do projeto — nada foi só "portado e confiado")

* **`dct2d.ts`**: DCT-II/DCT-III são ortonormais — round-trip exato e
  preservação de energia (Parseval) testados diretamente
  (`__tests__/dct2d.test.ts`).
* **Autovalores do Laplaciano sob DCT-II**: a fórmula clássica
  `κ(k,l) = 2·(cos(πk/M) + cos(πl/N) - 2)` (usada pelo `PoissonDCT_variant`
  oficial pra resolver a EDP rápido) foi **verificada cruzando contra o
  Laplaciano calculado diretamente** (`div(grad(.))` pixel a pixel) em
  vetores aleatórios — `IDCT2(κ · DCT2(x)) ≈ laplacian(x)` — antes de
  confiar nela pro solver rápido (`reflectionSuppress.test.ts`).
* **O algoritmo em si**: testado contra um ground truth sintético que bate
  com a premissa real do método (diferente do teste que reprovou o modelo
  de IA, que usava uma mistura arbitrária) — uma cena de alto contraste
  (quadrado sólido) com um reflexo sintético de **baixo gradiente**
  (rampa suave) somado por cima. O resultado: o MSE contra a cena limpa
  **melhora de verdade**, e a borda forte do quadrado continua bem
  preservada (não borra a cena real inteira).
* **Loop fechado com vídeo real**: `RenderingEngine.test.ts` gera um vídeo
  MP4 de verdade (não só um array em memória) com o mesmo padrão
  quadrado+rampa, roda `reflection.analyze` → `reflection.act` →
  `RenderingEngine.render()` (overlay real composto via FFmpeg) e confirma
  que o **frame do vídeo renderizado** fica mensuravelmente mais perto da
  cena limpa do que o vídeo original.
* **Ponta a ponta pela UI real do Electron**: importar um vídeo sintético
  com reflexo → marcar "Reduzir reflexo/brilho difuso" → aplicar melhorias
  → confirmar que a descrição relatada contém "Reflexo/brilho difuso
  reduzido".

### Performance (por que a resolução de trabalho é limitada)

O custo do solver escala de forma não-linear com o número de pixels (DCT
2D separável, O(N²) por transformada 1D vezes N linhas/colunas). Medido
neste ambiente: ~1.1s por canal a 640×480, ~6s a 1280×720, ~20s a
1920×1080 — em RGB (3 canais), isso vira ~3.5s / ~18s / ~60s
respectivamente. Por isso:
* `reflection.analyze` roda numa resolução reduzida (320px de largura) —
  rápido o bastante pra rodar em toda cena sem custar segundos por si só.
* `reflection.act` roda numa resolução maior (960px de largura) pra gerar
  o overlay final — o Rendering Engine escala esse overlay pro tamanho real
  do frame ao compor (`RenderingEngine.ts`, `ImageOverlay.width/height`,
  extensão feita pra isso — testada em `RenderingEngine.test.ts`).

## Limitação honesta mais importante: isso não é um detector de espelho

`meanAbsoluteChange` (o sinal medido por `reflection.analyze`) mede **quanto
o algoritmo mudou a imagem**, não **"tem um reflexo aqui"**. O algoritmo
suprime QUALQUER gradiente fraco/difuso — o que inclui reflexos reais, mas
também sombras suaves, gradientes de parede, iluminação ambiente. Medido
contra os vídeos de exemplo reais deste projeto: bedroom ~0.030, kitchen
~0.035, bathroom (com espelho) ~0.008 — ou seja, **não há uma separação
clara entre "cena com reflexo" e "cena qualquer"** nesse sinal. Por isso:

* O limiar de corte (`MIN_CHANGE_THRESHOLD = 0.003`) é propositalmente
  baixo — só filtra cenas praticamente sem gradiente nenhum (parede lisa,
  cor sólida), não tenta ser um classificador de "isso é reflexo".
* Confidence sempre no nível `confirm` (nunca auto-executa) — igual a
  `perspective.act`/`home_staging.act`, mas aqui com um motivo a mais: sem
  um jeito real de confirmar "havia mesmo um reflexo aqui", o usuário
  sempre assiste a prévia renderizada e decide se o resultado ficou melhor.
* É uma correção **de cena inteira** (overlay cobre o frame todo), não
  localizada — diferente de `home_staging.act`, que age só na região de um
  objeto detectado.

## Decisão

Diferente da segunda rodada (onde tínhamos um candidato acessível mas ele
reprovou no teste empírico), aqui o resultado é positivo: um algoritmo real,
sem dependência de pesos treinados/hospedagem externa, verificado em várias
camadas (matemática, unitário, loop fechado com vídeo real, UI real) —
shipped como `reflection.analyze`/`reflection.act`. A limitação que
permanece (não localizar a superfície reflexiva) é honesta e documentada,
não escondida atrás de um nome de capability que promete mais do que
entrega.

## Caminho futuro

* Um detector real de superfície reflexiva (dos candidatos da primeira/
  segunda rodada) continuaria sendo o complemento natural — permitiria
  restringir a correção à região do espelho/vidro em vez do frame inteiro.
  Caminho: camada Cloud (acesso de rede irrestrito) resolve o problema de
  hospedagem.
* O solver DCT atual é O(N²) por transformada 1D (implementação direta,
  cacheada — ver `dct2d.ts`); uma versão baseada em FFT (O(N log N))
  permitiria rodar em resoluções maiores sem o custo atual. Não foi feita
  porque exigiria reduzir o comprimento a potência de 2 ou implementar
  Bluestein pra tamanhos arbitrários — risco de bug maior que o ganho,
  dado que a resolução atual (960px) já produz um resultado visível e
  verificado.
