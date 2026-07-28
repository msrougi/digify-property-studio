"""
Exporta o scaler + classificador treinados (scikit-learn) como um único grafo
ONNX, para rodar via onnxruntime-node junto do backbone MobileNetV2 — sem
precisar de Python em produção (ADR-0001, item G: nenhum sidecar Python no
caminho crítico offline).
"""

from pathlib import Path

import joblib
import numpy as np
from skl2onnx import to_onnx

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "room_classifier.joblib"
SCALER_PATH = ROOT / "models" / "scaler.joblib"
OUTPUT_PATH = ROOT / "models" / "room_classifier_head.onnx"


def main() -> None:
    scaler = joblib.load(SCALER_PATH)
    classifier = joblib.load(MODEL_PATH)

    # Combina scaler + classificador num único Pipeline para exportar como um
    # grafo ONNX só — a inferência em Node roda um único session.run().
    from sklearn.pipeline import Pipeline

    pipeline = Pipeline([("scaler", scaler), ("classifier", classifier)])

    sample_input = np.zeros((1, 1000), dtype=np.float32)
    onnx_model = to_onnx(
        pipeline,
        sample_input,
        target_opset=12,
        options={id(classifier): {"zipmap": False}},
    )

    OUTPUT_PATH.write_bytes(onnx_model.SerializeToString())
    print(f"Exportado para {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
