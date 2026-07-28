# Room Classifier — `room.recognize`

**Status: protótipo de validação. Não usar em produção sem resolver a licença
do dataset de treino (ver seção "Licença" abaixo).**

Primeira capability do catálogo que usa um modelo de IA treinado de verdade
(não regra determinística/ffmpeg como `intake`, `scene.detect`, `lighting.*`,
`color.act`).

## O que foi feito

1. **Backbone**: MobileNetV2 pré-treinado em ImageNet, formato ONNX oficial
   (ONNX Model Zoo, `onnx/models` no GitHub). Hash SHA-256 verificado no
   download (`c0c3f76d...`). Usado como extrator de features fixo (1000
   dimensões, sem fine-tuning) — nenhum peso do backbone foi alterado.
2. **Dataset**: [`emanhamed/Houses-dataset`](https://github.com/emanhamed/Houses-dataset)
   — 535 casas reais, 4 fotos cada (bedroom/bathroom/kitchen/frontal). Usamos
   as 3 categorias de ambiente interno (1605 imagens), descartando "frontal"
   (fachada, não é um cômodo).
3. **Classificador**: Regressão Logística (scikit-learn) treinada sobre as
   features do MobileNetV2. Não é deep learning "do zero" — é transfer
   learning, a abordagem certa para poucos dados e sem GPU.
4. **Split**: 80% treino (1284 imagens) / 20% teste (321 imagens),
   estratificado, `random_state` fixo para reprodutibilidade.
5. **Exportação**: classificador + normalizador exportados para ONNX
   (`skl2onnx`), verificado byte-a-byte contra as predições do scikit-learn
   original antes de virar o modelo de produção.
6. **Inferência em produção**: `onnxruntime-node` (Node/Electron), sem
   Python — consistente com ADR-0001, item G. Ao contrário do
   `better-sqlite3`, não precisou de rebuild específico para o ABI do
   Electron (N-API é estável entre versões — ver ENGINEERING_STANDARDS.md).

## Resultado real (não estimado)

```
Acurácia treino: 99.69%
Acurácia teste (holdout nunca visto): 96.26%

              precision    recall  f1-score   support
    bathroom       0.94      0.95      0.95       107
     bedroom       0.99      0.96      0.98       107
     kitchen       0.95      0.97      0.96       107
```

Reprodutível via `tools/room-classifier/scripts/` (ver README daquela pasta).

## Licença do dataset — ⚠️ bloqueador para produção

O repositório `emanhamed/Houses-dataset` **não tem arquivo de licença**. O
README pede apenas citação do paper (Ahmed & Moustafa, 2016, "House price
estimation from visual and textual features"). Isso é adequado para
pesquisa/validação de pipeline — que é exatamente o que este documento
registra — mas **não constitui uma licença clara para uso comercial**.

Antes de este modelo (ou um retreinado com o mesmo pipeline) ir para o
produto em produção, uma das opções abaixo precisa acontecer:

1. Contato com os autores do dataset pedindo autorização explícita de uso
   comercial; ou
2. Retreinar o mesmo pipeline (já pronto e validado) com fotos próprias —
   fotos de imóveis reais do Digify, ou um dataset licenciado
   comercialmente. O pipeline não muda, só a fonte de dados.

## Limitações conhecidas

* Apenas 3 categorias: `bedroom`, `bathroom`, `kitchen`. O catálogo completo
  de ambientes (docs/reference/original-docs/10 - Computer Vision
  Architecture.md) lista ~20 tipos — os demais (sala, varanda, piscina,
  closet, garagem, ...) não têm dado de treino ainda.
* Dataset de 535 casas é pequeno e potencialmente enviesado (fotografia
  americana, ~2016) — desempenho em fotos brasileiras/vídeo pode ser pior do
  que os 96,3% medidos.
* Classifica um único frame por cena (o do meio), não o vídeo inteiro.
* Sem fine-tuning do backbone — só a camada final foi treinada. Mais dados
  provavelmente justificariam fine-tunar o MobileNetV2 também.

## Como reproduzir / retreinar

```bash
cd tools/room-classifier
python3 -m venv .venv && source .venv/bin/activate
pip install onnxruntime numpy pillow scikit-learn skl2onnx onnx

./scripts/download_dataset.sh        # baixa o dataset (troque a fonte aqui para retreinar com dados próprios)
python3 scripts/extract_features.py  # extrai features via MobileNetV2
python3 scripts/train_classifier.py  # treina e avalia
python3 scripts/export_onnx.py       # exporta para ONNX
cp models/room_classifier_head.onnx ../../apps/desktop/models/
```
