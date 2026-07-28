"""Verifica que o ONNX exportado produz saída numericamente equivalente ao
TorchScript original, em múltiplas resoluções (prova real de que os eixos
dinâmicos funcionam, não só a resolução usada no trace).

Também documenta e confirma o workaround necessário: com as otimizações de
grafo padrão do ONNX Runtime, os nós DFT (usados pelas Fast Fourier
Convolutions do LaMa) disparam um bug real de reaproveitamento de buffer
("Shape mismatch attempting to re-use buffer") — mesmo na resolução exata do
trace. Com `graph_optimization_level = ORT_DISABLE_ALL` (equivalente a
`graphOptimizationLevel: 'disabled'` no onnxruntime-node), o problema some e
a saída bate com o TorchScript dentro da margem de ponto flutuante.
"""

import os

import numpy as np
import onnxruntime as ort
import torch

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
TORCHSCRIPT_PATH = os.path.join(MODELS_DIR, "big-lama.pt")
ONNX_PATH = os.path.join(MODELS_DIR, "lama_inpainting.onnx")

TEST_SIZES = [(256, 256), (512, 512), (320, 448), (400, 600)]
MAX_ALLOWED_DIFF = 0.001  # bem acima do ruído observado (~1e-4), com margem


def main() -> None:
    model = torch.jit.load(TORCHSCRIPT_PATH, map_location="cpu").eval()

    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    session = ort.InferenceSession(ONNX_PATH, sess_options=opts, providers=["CPUExecutionProvider"])

    all_ok = True
    for height, width in TEST_SIZES:
        rng = np.random.RandomState(42)
        img = rng.rand(1, 3, height, width).astype("float32")
        mask = np.zeros((1, 1, height, width), dtype="float32")
        mask[:, :, height // 4 : height // 2, width // 4 : width // 2] = 1.0

        with torch.no_grad():
            torch_out = model(torch.from_numpy(img), torch.from_numpy(mask)).numpy()

        onnx_out = session.run(None, {"img_1": img, "mask_1": mask})[0]

        diff = np.abs(torch_out - onnx_out).max()
        status = "OK" if diff < MAX_ALLOWED_DIFF else "FALHOU"
        if diff >= MAX_ALLOWED_DIFF:
            all_ok = False
        print(f"{height}x{width}: diff máximo = {diff:.6f} [{status}]")

    if not all_ok:
        raise SystemExit(1)
    print("\nTodas as resoluções bateram com o TorchScript original.")


if __name__ == "__main__":
    main()
