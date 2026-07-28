"""
Extrai features reais das imagens usando o MobileNetV2 pré-treinado em ImageNet
(ONNX Model Zoo, sha256 verificado — ver models/mobilenetv2-12.onnx).

Nenhum dado é inventado: cada vetor de features vem de uma inferência real do
modelo sobre uma foto real do dataset emanhamed/Houses-dataset.
"""

from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MODEL_PATH = ROOT / "models" / "mobilenetv2-12.onnx"
OUTPUT_PATH = ROOT / "models" / "features.npz"

CATEGORIES = ["bedroom", "bathroom", "kitchen"]

# Normalização padrão ImageNet (mesma usada no treinamento original do MobileNetV2).
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def preprocess(image_path: Path) -> np.ndarray:
    image = Image.open(image_path).convert("RGB").resize((224, 224))
    array = np.asarray(image, dtype=np.float32) / 255.0
    array = (array - IMAGENET_MEAN) / IMAGENET_STD
    array = array.transpose(2, 0, 1)  # HWC -> CHW
    return array.astype(np.float32)


def main() -> None:
    session = ort.InferenceSession(str(MODEL_PATH))
    input_name = session.get_inputs()[0].name

    features: list[np.ndarray] = []
    labels: list[str] = []
    paths: list[str] = []

    for category in CATEGORIES:
        image_paths = sorted((DATA_DIR / category).glob("*.jpg"))
        print(f"{category}: {len(image_paths)} imagens")
        for image_path in image_paths:
            batch = preprocess(image_path)[np.newaxis, ...]
            output = session.run(None, {input_name: batch})[0]
            features.append(output[0])
            labels.append(category)
            paths.append(str(image_path.relative_to(ROOT)))

    features_array = np.stack(features)
    labels_array = np.array(labels)
    paths_array = np.array(paths)

    np.savez(OUTPUT_PATH, features=features_array, labels=labels_array, paths=paths_array)
    print(f"\nSalvo em {OUTPUT_PATH}: {features_array.shape[0]} amostras, "
          f"{features_array.shape[1]} dimensões de feature")


if __name__ == "__main__":
    main()
