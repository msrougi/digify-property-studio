#!/usr/bin/env bash
# Baixa o dataset real emanhamed/Houses-dataset (GitHub) — 535 casas, 3 categorias
# de cômodo usadas (bedroom, bathroom, kitchen). "frontal" (fachada) é descartada
# por não ser um ambiente interno.
#
# Fonte: https://github.com/emanhamed/Houses-dataset
# Uso: pesquisa/validação de pipeline. Sem licença explícita para uso comercial
# (ver README do dataset original) — não usar o modelo resultante em produção
# sem revisar a questão de licenciamento (docs/ml/ROOM_CLASSIFIER.md).
set -euo pipefail

BASE_URL="https://raw.githubusercontent.com/emanhamed/Houses-dataset/master/Houses%20Dataset"
DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data"
CATEGORIES=(bedroom bathroom kitchen)
TOTAL_HOUSES=535

download_one() {
  local id="$1"
  local category="$2"
  local out="${DATA_DIR}/${category}/${id}.jpg"
  if [[ -s "$out" ]]; then
    return 0
  fi
  curl -sS --max-time 15 -o "$out" "${BASE_URL}/${id}_${category}.jpg" || echo "FALHOU: ${id}_${category}"
}
export -f download_one
export BASE_URL DATA_DIR

for category in "${CATEGORIES[@]}"; do
  mkdir -p "${DATA_DIR}/${category}"
  echo "Baixando categoria: ${category}"
  seq 1 "$TOTAL_HOUSES" | xargs -P 12 -I{} bash -c 'download_one "$@"' _ {} "$category"
done

echo "--- Resumo ---"
for category in "${CATEGORIES[@]}"; do
  count=$(find "${DATA_DIR}/${category}" -name "*.jpg" -size +0c | wc -l)
  echo "${category}: ${count} imagens"
done
