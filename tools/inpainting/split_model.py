"""Divide o `lama_inpainting.onnx` em partes versionáveis no GitHub.

O modelo tem ~196MB — acima do limite de 100MB por arquivo do GitHub, e
acima também do limite de anexo do chat, o que na prática deixava o
inpainting real indisponível pra quem só clona o repositório (o app caía
silenciosamente no fallback `delogo`).

Este script quebra o arquivo em pedaços abaixo do limite, que SÃO
versionados. `apps/desktop/scripts/assemble-models.mjs` remonta o arquivo
original no lugar certo, e valida por SHA-256 — remontagem parcial ou
pedaço corrompido falha alto, nunca produz um .onnx silenciosamente
inválido.

Uso:
    python3 split_model.py ../../apps/desktop/models/lama_inpainting.onnx
"""

import hashlib
import json
import shutil
import sys
from pathlib import Path

# Bem abaixo do limite de 100MB do GitHub — sem chegar perto o bastante pra
# depender de arredondamento de contagem de bytes.
CHUNK_SIZE = 80 * 1024 * 1024


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    source = Path(sys.argv[1]).resolve()
    parts_dir = source.parent / f"{source.name}.parts"

    if parts_dir.exists():
        shutil.rmtree(parts_dir)
    parts_dir.mkdir()

    total_sha = sha256_of(source)
    total_size = source.stat().st_size
    print(f"origem: {source} ({total_size / 1024 / 1024:.1f} MB)")
    print(f"sha256: {total_sha}")

    parts: list[str] = []
    with source.open("rb") as handle:
        index = 0
        while True:
            block = handle.read(CHUNK_SIZE)
            if not block:
                break
            name = f"part-{index:03d}"
            (parts_dir / name).write_bytes(block)
            parts.append(name)
            print(f"  {name}: {len(block) / 1024 / 1024:.1f} MB")
            index += 1

    manifest = {
        "target": source.name,
        "sha256": total_sha,
        "sizeBytes": total_size,
        "parts": parts,
    }
    (parts_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\nOK: {len(parts)} partes + manifest.json em {parts_dir}")


if __name__ == "__main__":
    main()
