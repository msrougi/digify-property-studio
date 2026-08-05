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

## Bug real encontrado testando num vídeo de imóvel de verdade: zero objetos detectados numa cena bagunçada

Um usuário importou um vídeo de banheiro visivelmente bagunçado e o
Property Score voltou 100/100, "0 objeto(s) detectado(s)". Duas causas reais,
corrigidas juntas:

1. **Um frame só por cena não é suficiente.** A detecção rodava só no frame
   do meio da cena — se a bagunça não estava visível exatamente nesse
   instante (câmera em movimento, ângulo, oclusão momentânea), nada era
   detectado, mesmo a cena inteira estando bagunçada. **Fix**: agora roda em
   `SAMPLES_PER_SCENE = 5` frames reais espalhados pela cena inteira
   (`ObjectDetectCapability.sampleTimestamps`), cada um com o mesmo
   decode+NMS de sempre — os resultados de todos os frames são unidos e
   passam por um NMS final (evita duplicar o mesmo objeto físico visto em
   frames próximos). `ObjectDetectInput` agora recebe `sceneStartMs`/
   `sceneEndMs` em vez de um único `atMs`.
2. **O mapeamento de categoria era conservador demais.** Decoração solta,
   eletrônicos e itens de valor (`potted plant`, `vase`, `clock`, `book`,
   `teddy bear`, `tv`, `laptop`, `wine glass`, `skis`, `snowboard`,
   `surfboard`) estavam em `decorative`/`luxury` — nunca removíveis. Pedido
   explícito do usuário, confirmado depois de uma pergunta direta sobre o
   trade-off real (móveis grandes tipo sofá/cama continuam protegidos
   porque a técnica de remoção atual — borrão/interpolação, sem inpainting
   real disponível no momento — fica feia em regiões grandes; só o que
   "não é móvel nem eletrodoméstico fixo" virou candidato real a remoção).
   **Fix**: essas classes foram movidas pra `temporary` (removível) em
   `objectCategoryMapping.ts`. Só ficam protegidos móveis/eletrodomésticos
   fixos de verdade: `chair`, `couch`, `bed`, `dining table`, `toilet`,
   `sink`, `refrigerator`, `oven`, `microwave`, `toaster`, `bench`.

## Limitações conhecidas

* O COCO não tem classes de elementos estruturais (parede/porta/janela) nem
  categorias de luxo muito específicas do mercado imobiliário — o mapeamento
  é uma primeira aproximação razoável, não uma taxonomia validada.
* Veículos (carro, ônibus, etc.) não se encaixam bem em nenhuma categoria do
  domínio hoje — mapeados como `personal` por segurança (nunca removíveis
  automaticamente) até o domínio ganhar uma categoria própria.
* Mesmo com 5 frames por cena, o COCO ainda não tem classes de "bagunça
  genérica" (roupa jogada, caixas, cabos, papel) — só reconhece objetos
  bem definidos que já existiam no dataset original. Detecção continua
  zero-shot, sem fine-tuning específico para "clutter" imobiliário.
* Móveis grandes (sofá, cama, mesa) continuam nunca-removíveis por decisão
  de produto: a técnica de remoção atual não tem qualidade suficiente pra
  regiões grandes (ver docs/ml/HOME_STAGING.md e o "Bug real" acima).
