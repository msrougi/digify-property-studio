"""
Treina um classificador real (Regressão Logística) sobre as features extraídas
do MobileNetV2, para prever o tipo de ambiente (bedroom/bathroom/kitchen).

Split treino/teste real e estratificado — a acurácia reportada vem de imagens
que o classificador nunca viu durante o treino.
"""

import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

ROOT = Path(__file__).resolve().parent.parent
FEATURES_PATH = ROOT / "models" / "features.npz"
MODEL_OUTPUT = ROOT / "models" / "room_classifier.joblib"
SCALER_OUTPUT = ROOT / "models" / "scaler.joblib"
METRICS_OUTPUT = ROOT / "models" / "metrics.json"
LABELS_OUTPUT = ROOT / "models" / "labels.json"

RANDOM_SEED = 42


def main() -> None:
    data = np.load(FEATURES_PATH, allow_pickle=True)
    features, labels = data["features"], data["labels"]

    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.2,
        random_state=RANDOM_SEED,
        stratify=labels,
    )
    print(f"Treino: {len(x_train)} amostras | Teste: {len(x_test)} amostras")

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_test_scaled = scaler.transform(x_test)

    classifier = LogisticRegression(max_iter=2000, C=1.0, random_state=RANDOM_SEED)
    classifier.fit(x_train_scaled, y_train)

    train_accuracy = accuracy_score(y_train, classifier.predict(x_train_scaled))
    test_predictions = classifier.predict(x_test_scaled)
    test_accuracy = accuracy_score(y_test, test_predictions)

    print(f"\nAcurácia treino: {train_accuracy:.4f}")
    print(f"Acurácia teste (holdout real, nunca visto): {test_accuracy:.4f}\n")
    print(classification_report(y_test, test_predictions))
    print("Matriz de confusão (linhas=real, colunas=previsto):")
    labels_sorted = sorted(set(labels))
    print(labels_sorted)
    print(confusion_matrix(y_test, test_predictions, labels=labels_sorted))

    joblib.dump(classifier, MODEL_OUTPUT)
    joblib.dump(scaler, SCALER_OUTPUT)
    LABELS_OUTPUT.write_text(json.dumps(labels_sorted))
    METRICS_OUTPUT.write_text(
        json.dumps(
            {
                "train_accuracy": train_accuracy,
                "test_accuracy": test_accuracy,
                "train_samples": len(x_train),
                "test_samples": len(x_test),
                "classes": labels_sorted,
            },
            indent=2,
        )
    )
    print(f"\nModelo salvo em {MODEL_OUTPUT}")


if __name__ == "__main__":
    main()
