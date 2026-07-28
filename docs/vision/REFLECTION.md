# Reflection — `reflection.analyze` / `reflection.act`

**Status: pesquisado, não implementado — sem sinal real disponível neste ambiente.**

## O que o catálogo original pedia

docs/reference/original-docs/08 - AI Agents.md: detectar superfícies
reflexivas e objetos indesejados refletidos (equipe/tripé aparecendo em um
espelho, por exemplo).

## Por que isso não é como `object.detect`

O COCO (base do `object.detect`, 80 classes) não tem classe "espelho"/
"vidro"/"superfície reflexiva" — isso não é um objeto comum de foto do
dia a dia, é uma categoria de nicho de pesquisa acadêmica em visão
computacional (segmentação de espelhos/vidro). Precisaríamos de um modelo
treinado especificamente para essa tarefa.

## O que pesquisamos (mesmo padrão de diligência do inpainting em `docs/ml/HOME_STAGING.md`)

| Modelo/Dataset | O que é | Onde os pesos ficam | Resultado |
|---|---|---|---|
| MirrorNet (ICCV 2019) | Segmentação de espelhos, backbone ResNeXt | Google Drive | ❌ Bloqueado |
| memgonzales/mirror-segmentation (WSCG 2023) | CNN leve p/ espelhos (EfficientNetV2), BSD-3 | Google Drive | ❌ Bloqueado |
| GDNet (CVPR 2020) | Detecção de vidro | Página do projeto + Google Drive (backbone) | ❌ Bloqueado |
| 3DRef (EBLNet/PCSeg/SATNet) | Dataset+modelos de reflexão 3D | Página do projeto (403 mesmo via HTTPS direto) | ❌ Bloqueado |
| CSAILVision/semantic-segmentation-pytorch | Segmentação ADE20K (150 classes, inclui "mirror") | Servidor próprio do MIT CSAIL (`sceneparsing.csail.mit.edu`) | ❌ Testado diretamente via `curl` — bloqueado pelo proxy deste ambiente (só GitHub/PyPI/npm liberados) |
| ONNX Model Zoo (`onnx/models`, hospedado no próprio GitHub) | Segmentação (FCN/DUC/Mask-RCNN) | GitHub — acessível | ✅ Acessível, mas nenhum modelo treinado em ADE20K/Objects365 (só Cityscapes/VOC/COCO) — nenhum tem classe de espelho/vidro |
| Objects365 (365 classes, inclui "Mirror") | Dataset com a classe certa | — | Times como Ultralytics/OpenMMLab confirmam publicamente que **não vão liberar** pesos pré-treinados nele |

Cada candidato sério da comunidade acadêmica de segmentação de espelho/vidro
hospeda pesos fora do allowlist de rede deste ambiente (Google Drive, ou
servidor próprio institucional) — o mesmo padrão exato encontrado na busca
por modelos de inpainting.

## Decisão

Diferente do `home_staging.act` (onde existia um fallback clássico honesto —
`delogo` — real ainda que limitado), aqui **não existe um fallback clássico
honesto**. Uma heurística de "manchas muito brilhantes = reflexo" (via
`signalstats`, mesma técnica de `lighting.analyze`) produziria falsos
positivos constantes com qualquer janela ou luminária — isso não seria uma
versão "limitada mas real" da capability, seria uma capability diferente
fingindo ser reflection detection. Preferimos manter `reflection.analyze`/
`reflection.act` como `planned` a entregar isso.

## Caminho futuro

Mesmo caminho do inpainting: a camada Cloud (acesso de rede irrestrito)
resolve o problema de hospedagem — qualquer um dos modelos acima passa a
ser baixável de lá. Até lá, a limitação é honesta e documentada, não
mascarada.
