# Home Staging — `home_staging.act`

**Status: shipped, mas com limitação de qualidade importante — leia antes de
usar em produção.**

## O que o catálogo original pedia

docs/reference/original-docs/08 - AI Agents.md descreve "AI Home Staging"
como capaz de remover itens temporários (roupas, sacolas, baldes, caixas,
fios, brinquedos) mantendo a remoção sempre reversível. Isso, na prática,
exige um modelo de **inpainting generativo**: detectar o objeto e preencher
a região com conteúdo plausível (não apenas apagar).

## O que tentamos baixar (e por quê não deu)

Pesquisamos ativamente por um modelo de inpainting real, gratuito e com
licença comercial viável:

| Modelo | Licença | Resultado |
|---|---|---|
| LaMa | Apache 2.0 | ❌ Pesos só no Google Drive (bloqueado neste ambiente) |
| Moebius (ECCV 2026) | Apache 2.0 | ❌ Pesos só no Hugging Face, 1,27GB (bloqueado) |
| MI-GAN | MIT | ❌ Pesos só no Google Drive (bloqueado) |
| IOPaint (empacota vários) | — | ❌ Baixa do próprio CDN deles (bloqueado) |

Este ambiente de desenvolvimento só tem rede liberada para GitHub
(raw/releases) e PyPI/npm. Praticamente todo mundo na comunidade de
inpainting hospeda pesos em Hugging Face ou Google Drive — nenhum dos
candidatos sérios usa GitHub Releases para os arquivos de peso.

## O que foi implementado de verdade

Combinamos duas coisas 100% reais:

1. **Detecção real** (`object.detect`, YOLOX-Nano) — identifica objetos
   temporários com bounding box real.
2. **Remoção via filtro `delogo` do FFmpeg** — não é IA, é interpolação da
   vizinhança (a mesma técnica usada pra remover logos de TV estáticos).
   Funciona razoavelmente bem para objetos pequenos sobre fundo uniforme
   (chão liso, bancada lisa). Funciona mal para fundos complexos ou
   padronizados (azulejo, textura, objetos atrás).

## Decisão de confidence

A capability retorna confidence **75** de propósito — cai na faixa "confirm"
(docs/00-ARCHITECTURE.md, seção 6), nunca "auto". O usuário sempre precisa
confirmar antes da remoção ser aplicada, porque a técnica é real mas
limitada — nunca deve parecer uma decisão automática confiável.

## Caminho para melhorar isso de verdade

Quando a Fase Cloud existir (docs/reference/original-docs/14 - Cloud
Architecture.md já prevê "Cloud AI: modelos muito grandes, processamentos
pesados"), rodar LaMa/Moebius/MI-GAN lá resolve o problema — nuvem tem
acesso de rede irrestrito e pode ter GPU. Até lá, `delogo` é o melhor
resultado real disponível para 100% local/offline neste ambiente.
