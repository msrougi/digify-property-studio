"""
Verifica com ground truth sintético se o modelo de reflection removal
(PINTO0309/reflection-removal, DINOv3 ViT-S disthyper+residual, ONNX) produz
uma saída de fato mais próxima da cena original do que a entrada com
reflexo — não apenas "roda sem erro". Ver tools/reflection-removal/README.md
para o resultado obtido e a decisão de não integrar.

Reflexo sintético: blended = (1-alpha)*clean + alpha*ghost (modelo físico
simples de reflexo fraco através de vidro, mesma técnica usada no dataset
oficial do projeto). Sucesso = MSE(transmission, clean) < MSE(blended, clean).
"""

import cv2
import numpy as np
import onnxruntime as ort

MODELS = {
    "320": "models/reflection_removal_dinov3_vits16_320.onnx",
    "640": "models/reflection_removal_dinov3_vits16_640.onnx",
}
ALPHAS = [0.05, 0.10, 0.15]
INPUT_HW = (640, 640)


def load_rgb(path: str) -> np.ndarray:
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return cv2.resize(rgb, (INPUT_HW[1], INPUT_HW[0]), interpolation=cv2.INTER_AREA)


def to_tensor(rgb: np.ndarray) -> np.ndarray:
    t = rgb.astype(np.float32) / 255.0
    t = np.transpose(t, (2, 0, 1))
    return np.expand_dims(t, axis=0)


def postprocess(out: np.ndarray) -> np.ndarray:
    data = np.squeeze(out, axis=0)
    data = np.transpose(data, (1, 2, 0))
    data = np.clip(data, 0.0, 1.0) * 255.0
    data = cv2.resize(data, (INPUT_HW[1], INPUT_HW[0]), interpolation=cv2.INTER_CUBIC)
    return data.astype(np.uint8)


def mse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2))


def main() -> None:
    clean = load_rgb("testimgs/clean.jpg")
    ghost = load_rgb("testimgs/ghost.jpg")

    any_pass = False
    for label, model_path in MODELS.items():
        session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        input_name = session.get_inputs()[0].name

        for alpha in ALPHAS:
            blended = np.clip(
                (1 - alpha) * clean.astype(np.float32) + alpha * ghost.astype(np.float32), 0, 255
            ).astype(np.uint8)

            tensor = to_tensor(blended)
            transmission = session.run(["transmission"], {input_name: tensor})[0]
            transmission_rgb = postprocess(transmission)

            mse_blended = mse(blended, clean)
            mse_transmission = mse(transmission_rgb, clean)
            improvement_pct = 100.0 * (mse_blended - mse_transmission) / mse_blended
            passed = mse_transmission < mse_blended
            any_pass = any_pass or passed

            status = "PASS" if passed else "FAIL"
            print(
                f"[{label}, alpha={alpha:.2f}] MSE(blended)={mse_blended:7.2f}  "
                f"MSE(transmission)={mse_transmission:7.2f}  melhora={improvement_pct:+7.1f}%  {status}"
            )

            cv2.imwrite(f"testimgs/blended_{label}_a{alpha:.2f}.png", cv2.cvtColor(blended, cv2.COLOR_RGB2BGR))
            cv2.imwrite(
                f"testimgs/transmission_{label}_a{alpha:.2f}.png",
                cv2.cvtColor(transmission_rgb, cv2.COLOR_RGB2BGR),
            )

    print()
    if any_pass:
        print("Ao menos um caso melhorou — reavaliar integração.")
    else:
        print(
            "FAIL geral: em nenhuma combinação de resolução/intensidade de reflexo o modelo "
            "reduziu a distância até a cena limpa — sem sinal real utilizável nesta versão."
        )


if __name__ == "__main__":
    main()
