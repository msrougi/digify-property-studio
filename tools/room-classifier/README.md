# Room Classifier — Pipeline de Treino

Documentação completa: [`docs/ml/ROOM_CLASSIFIER.md`](../../docs/ml/ROOM_CLASSIFIER.md)
(fonte de dados, licença, acurácia real, limitações).

## Uso rápido

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install onnxruntime numpy pillow scikit-learn skl2onnx onnx

./scripts/download_dataset.sh
python3 scripts/extract_features.py
python3 scripts/train_classifier.py
python3 scripts/export_onnx.py
```

`data/`, `.venv/` e os artefatos intermediários (`*.npz`, `*.joblib`) não são
versionados — são regenerados pelos scripts acima. Os únicos artefatos que
importam para o produto (`mobilenetv2-12.onnx`, `room_classifier_head.onnx`)
são copiados para `apps/desktop/models/` e versionados lá.
