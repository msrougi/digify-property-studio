# Object Detection — `object.detect`

**Status: shipped, zero-shot (sem treino próprio).**

Diferente do `room.recognize` (que precisou de treino porque não existe
detector pré-treinado de "tipo de cômodo"), detecção de objetos domésticos já
está bem coberta pelo dataset COCO — não foi preciso treinar nada.

## O que foi usado

* **Modelo**: YOLOX-Nano ([Megvii-BaseDetection/YOLOX](https://github.com/Megvii-BaseDetection/YOLOX)),
  já em formato ONNX, direto dos releases oficiais do GitHub.
* **Licença**: Apache 2.0 — sem restrição de uso comercial (ao contrário do
  YOLOv8/YOLO11 da Ultralytics, que são AGPL-3.0 e exigiriam licença
  Enterprise paga ou abrir todo o código do produto).
* **Treinamento**: nenhum. Modelo usado exatamente como publicado, treinado
  em COCO (80 classes, incluindo boa parte do mobiliário/objetos domésticos
  relevantes: cadeira, sofá, cama, mesa, geladeira, forno, pia, vaso
  sanitário, planta, TV, etc.).
* **Pipeline de preprocessamento/decodificação**: verificado em Python
  (`tools/object-detector/verify_yolox.py`) contra o script de demo oficial
  antes de portar para TypeScript — mesma letterbox (proporção preservada,
  padding cinza 114, ancorado no canto superior esquerdo), mesma decodificação
  de grid/stride, mesmo NMS.

## Mapeamento para o domínio

As 80 classes do COCO foram mapeadas para as 5 categorias do domínio
(`structural` | `decorative` | `temporary` | `personal` | `luxury`) em
`apps/desktop/src/infrastructure/ml/yolox/objectCategoryMapping.ts`. Essa
mesma mudança revelou e corrigiu um bug real no domínio: a regra de
`removable` estava definida como "tudo que não é `structural`", o que teria
marcado sofás e geladeiras como removíveis. Corrigido para
`removable = category === "temporary"` (`packages/domain/src/entities/DetectedObject.ts`).

## Limitações conhecidas

* O COCO não tem classes de elementos estruturais (parede/porta/janela) nem
  categorias de luxo muito específicas do mercado imobiliário — o mapeamento
  é uma primeira aproximação razoável, não uma taxonomia validada.
* Veículos (carro, ônibus, etc.) não se encaixam bem em nenhuma categoria do
  domínio hoje — mapeados como `personal` por segurança (nunca removíveis
  automaticamente) até o domínio ganhar uma categoria própria.
* Detecção roda em um único frame por cena (o do meio), não no vídeo inteiro.
