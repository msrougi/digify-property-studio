# Qualidade Visual — `quality.sharpen`

**Status: shipped (processamento clássico), Real-ESRGAN avaliado e adiado.**

## O que foi avaliado

Pesquisamos super-resolução real (deixar o vídeo mais nítido/detalhado) via
[Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (BSD-3-Clause,
comercialmente livre). Conseguimos baixar os pesos reais (`.pth`) direto dos
releases do GitHub — ao contrário do inpainting, esses pesos estão
acessíveis neste ambiente.

## Por que não foi integrado agora

Duas barreiras práticas, não de licença/acesso:

1. **Arquitetura, não só peso**: os arquivos `.pth` são só os pesos —
   rodá-los exige reconstruir a arquitetura RRDBNet em código (via
   `basicsr`/`realesrgan`, pacotes Python com bastante dependência) e depois
   exportar para ONNX. Isso é um projeto por si só, do mesmo tamanho do que
   fizemos para `room.recognize`.
2. **Custo computacional**: super-resolução 4x é cara por frame. Aplicar a
   um vídeo inteiro (milhares de frames) em CPU, sem GPU, não é viável em
   tempo razoável neste hardware.

## O que foi implementado em vez disso

Filtro `unsharp` real do FFmpeg — processamento de sinal clássico (não é
IA), parâmetros conservadores (`unsharp=5:5:0.6:5:5:0.0`, só luma) para
evitar halos/artefatos. Aplica no vídeo inteiro, roda em milissegundos,
sempre disponível offline.

## Caminho futuro

Real-ESRGAN (ou similar) faz mais sentido na **Cloud AI** (mesma lógica do
`home_staging.act`): lá existe GPU e não há a barreira de rede deste
ambiente. Aplicar por frame-chave (thumbnail) em vez do vídeo inteiro também
reduziria o custo computacional a algo viável mesmo sem GPU — candidato
razoável para uma iteração futura, não implementado ainda.
