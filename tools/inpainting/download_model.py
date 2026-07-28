"""Baixa o checkpoint TorchScript real do LaMa (big-lama.pt) e verifica o MD5.

Fonte: Sanster/models no GitHub Releases (mesmo repositório usado pelo
IOPaint/lama-cleaner) — diferente de todos os outros candidatos de
inpainting pesquisados nesta sessão, este hospeda os pesos em GitHub
Releases, acessível neste ambiente (ver docs/ml/HOME_STAGING.md).
"""

import hashlib
import os
import sys
import urllib.request

MODEL_URL = "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt"
MODEL_MD5 = "e3aa4aaa15225a33ec84f9f4bc47e500"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "models", "big-lama.pt")


def md5sum(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    if os.path.exists(OUTPUT_PATH) and md5sum(OUTPUT_PATH) == MODEL_MD5:
        print(f"Já existe e MD5 confere: {OUTPUT_PATH}")
        return

    print(f"Baixando {MODEL_URL} -> {OUTPUT_PATH} (~196MB)...")
    urllib.request.urlretrieve(MODEL_URL, OUTPUT_PATH)

    actual_md5 = md5sum(OUTPUT_PATH)
    if actual_md5 != MODEL_MD5:
        os.remove(OUTPUT_PATH)
        print(f"MD5 não confere (esperado {MODEL_MD5}, obtido {actual_md5}) — removido.", file=sys.stderr)
        sys.exit(1)

    print(f"OK: MD5 verificado ({actual_md5})")


if __name__ == "__main__":
    main()
