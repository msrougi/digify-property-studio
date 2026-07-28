# Reflection — `reflection.analyze` / `reflection.act`

**Status: pesquisado (duas rodadas), testado empiricamente — sem sinal real
utilizável neste momento.**

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
essa tarefa.

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

## Segunda rodada — busca mais insistente ("deve existir algo")

Depois de encontrar o LaMa (inpainting) hospedado de forma acessível via
GitHub Releases — contrariando a conclusão anterior sobre inpainting —
repetimos a busca para Reflection com o mesmo padrão de insistência, além de
ampliar o escopo de "segmentação de espelho" para "remoção de reflexo em
imagem única" (single image reflection removal / SIRR), que resolveria o
mesmo problema do catálogo original por um caminho diferente (em vez de
segmentar a superfície reflexiva, estima e remove o próprio reflexo).

Verificamos a política de rede deste ambiente diretamente (não só por
tentativa e erro): `github.com`/`api.github.com`/`raw.githubusercontent.com`
e `pypi.org`/`files.pythonhosted.org` são acessíveis; `huggingface.co`,
`drive.google.com`, `dl.fbaipublicfiles.com` e domínios de download
próprios (ex.: `download.openmmlab.com`, `checkpoints.mingjia.li`) recebem
403 já no CONNECT do proxy. Busca de pacotes candidatos no PyPI (`gdnet`,
`mirror-segmentation`, `glass-detection`, etc.) não encontrou nada relevante
hospedado lá.

| Candidato | O que é | Onde os pesos ficam | Resultado |
|---|---|---|---|
| WZH0120/SAM2-UNet | Framework genérico (SAM2 encoder) avaliado em mirror detection | Google Drive + backbone SAM2 em `dl.fbaipublicfiles.com` | ❌ Bloqueado |
| chengqianyu03/AAAI26-MSNet | Detecção de superfície de vidro | Google Drive + SAM em `dl.fbaipublicfiles.com` | ❌ Bloqueado |
| hainuo-wang/XReflection (DSRNet/DSIT/RDNet, Apache 2.0) | Toolbox de reflection removal com benchmarks publicados | Servidor próprio (`checkpoints.mingjia.li`) | ❌ Bloqueado — confirmado via `curl` direto (403 no CONNECT) |
| zhuyr97/Reflection_RemoVal_CVPR2024, zdlarr/Location-aware-SIRR | Reflection removal acadêmico | Google Drive | ❌ Bloqueado |
| **PINTO0309/reflection-removal (MIT)** | Reflection removal via DINOv3 + GAN leve, ONNX pronto | **GitHub Releases — acessível** | ✅ Baixado e testado de verdade (ver abaixo) — **reprovado no teste empírico** |

## O único candidato realmente acessível — testado e reprovado com dados reais

`PINTO0309/reflection-removal` é diferente de todo o resto: pesos ONNX MIT
publicados como assets de GitHub Release (`.../releases/download/onnx/...`),
sem Google Drive nem servidor próprio. Baixamos os dois variantes
disponíveis (ViT-S, saída 320×320 e 640×640, ~89MB cada) e testamos de
verdade com a mesma disciplina de verificação usada no resto do projeto —
não paramos em "baixou e rodou sem erro", medimos se a saída de fato reduz
o reflexo contra um ground truth conhecido:

* **Metodologia** (`tools/reflection-removal/verify_onnx.py`): reflexo
  sintético fraco `blended = (1-α)·clean + α·ghost` (mistura linear de duas
  fotos reais, `α` em `{0.05, 0.10, 0.15}` — mesmo modelo físico simples
  usado pelo próprio dataset oficial do projeto para reflexo fraco), depois
  comparação de MSE contra `clean`: `blended` vs. `transmission` (a saída
  do modelo que deveria ser a versão sem reflexo).
* **Resultado real, nas duas resoluções e nos três níveis de reflexo**: o
  MSE da saída do modelo foi **sempre pior** que simplesmente não fazer nada
  (deltas de −48% a −213%, ou seja, a saída ficou mais distante da cena
  limpa do que a entrada com reflexo). Inspeção visual confirma: a saída
  fica borrada/perde detalhe (quadro na parede quase desaparece) e ainda
  mantém as linhas do reflexo sintético visíveis.
* Isso bate com o próprio aviso do autor no README: *"WIP... The quality of
  the reflection removal is not important for this project"* — o objetivo
  declarado do projeto é reduzir custo computacional de um GAN, não
  qualidade de remoção. Não é um modelo de produção.

## Decisão

Diferente da primeira rodada (onde a barreira era só hospedagem), desta vez
encontramos e testamos de verdade um modelo tecnicamente acessível — e ele
não passou no teste. Isso é uma conclusão mais forte e mais honesta do que
"não achamos pesos": tentamos, medimos, e o resultado real foi negativo.
Continuamos sem um fallback clássico honesto viável (uma heurística de
"manchas muito brilhantes = reflexo" via `signalstats` produziria falsos
positivos constantes com qualquer janela/luminária — não seria uma versão
limitada da capability, seria uma capability diferente fingindo ser
reflection detection). `reflection.analyze`/`reflection.act` seguem como
`planned`.

## Caminho futuro

Dois caminhos, não mutuamente exclusivos:
1. **Camada Cloud** (acesso de rede irrestrito) resolve o problema de
   hospedagem dos candidatos com resultados publicados de verdade (XReflection
   DSRNet/DSIT, MirrorNet, GDNet) — qualquer um passa a ser baixável de lá.
2. Reavaliar `PINTO0309/reflection-removal` no futuro: é um projeto ativo
   (WIP), então uma versão posterior pode passar no mesmo teste empírico que
   reprovou aqui — `tools/reflection-removal/verify_onnx.py` fica pronto
   para re-executar contra uma versão nova sem precisar reconstruir a
   metodologia de verificação do zero.
