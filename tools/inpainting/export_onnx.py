"""Converte o checkpoint TorchScript do LaMa (big-lama.pt) para ONNX.

O modelo usa Fast Fourier Convolutions (aten::fft_rfftn/fft_irfftn), que o
exportador ONNX legado do PyTorch (baseado em tracing/TorchScript) não sabe
converter. O caminho que funciona:

  TorchScript (torch.jit.load) -> ExportedProgram (TS2EPConverter) -> ONNX
  (exportador "dynamo", que decompõe fft_rfftn/fft_irfftn em nós DFT nativos
  do ONNX opset 17+).

Ver README.md desta pasta para o bug de runtime encontrado (e seu workaround)
ao rodar o ONNX resultante.
"""

import os

import torch
from torch._export.converter import TS2EPConverter

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
TORCHSCRIPT_PATH = os.path.join(MODELS_DIR, "big-lama.pt")
ONNX_PATH = os.path.join(MODELS_DIR, "lama_inpainting.onnx")

# Tamanho usado só para o trace inicial do TS2EPConverter — o ONNX resultante
# aceita qualquer H/W em tempo de execução (eixos dinâmicos), verificado em
# verify_onnx.py com múltiplas resoluções diferentes desta.
TRACE_SIZE = 256


def main() -> None:
    print(f"Carregando TorchScript de {TORCHSCRIPT_PATH}...")
    model = torch.jit.load(TORCHSCRIPT_PATH, map_location="cpu").eval()

    img = torch.rand(1, 3, TRACE_SIZE, TRACE_SIZE, dtype=torch.float32)
    mask = torch.zeros(1, 1, TRACE_SIZE, TRACE_SIZE, dtype=torch.float32)
    mask[:, :, 80:180, 80:180] = 1.0

    print("Convertendo TorchScript -> ExportedProgram (TS2EPConverter)...")
    exported_program = TS2EPConverter(model, (img, mask)).convert()

    print("Exportando ExportedProgram -> ONNX (exportador dynamo)...")
    onnx_program = torch.onnx.export(exported_program, (img, mask), dynamo=True)

    onnx_program.save(ONNX_PATH)
    print(f"OK: salvo em {ONNX_PATH}")


if __name__ == "__main__":
    main()
