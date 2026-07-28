# Reflection removal — teste empírico de um candidato real

Ver `docs/vision/REFLECTION.md` para o histórico completo da busca. Este
diretório documenta o único candidato de "reflection removal"/"segmentação
de espelho" encontrado nesta segunda rodada de pesquisa cujos pesos são
realmente acessíveis neste ambiente (hospedados em GitHub Releases, não
Google Drive/Hugging Face/servidor próprio): `PINTO0309/reflection-removal`
(MIT), um modelo DINOv3 + GAN leve que separa uma imagem "com reflexo" em
`transmission` (cena limpa) + `reflection` (o próprio reflexo).

**Resultado: baixado e testado de verdade — reprovado.** O autor já avisa no
README original que é um projeto WIP e que "a qualidade da remoção de
reflexo não é importante para este projeto" (o objetivo é reduzir custo
computacional, não qualidade). Confirmamos isso empiricamente.

## Passo a passo (reprodutível)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install onnxruntime numpy opencv-python-headless

# baixa os dois variantes ONNX publicados (GitHub Releases, ~89MB cada)
curl -L -o models/reflection_removal_dinov3_vits16_320.onnx \
  https://github.com/PINTO0309/reflection-removal/releases/download/onnx/dinov3_vits16_disthyper_residual_gennerator_640x640_320x320.onnx
curl -L -o models/reflection_removal_dinov3_vits16_640.onnx \
  https://github.com/PINTO0309/reflection-removal/releases/download/onnx/dinov3_vits16_disthyper_residual_gennerator_640x640_640x640.onnx

python3 verify_onnx.py       # roda as duas variantes x três intensidades de reflexo
```

## Metodologia de verificação

`verify_onnx.py` gera um reflexo sintético fraco (`blended = (1-α)·clean +
α·ghost`, mistura linear de duas fotos reais de `apps/desktop/.../__fixtures__`,
mesmo modelo físico usado pelo dataset oficial do projeto para reflexo
fraco) e mede o MSE contra `clean`: `blended` (não fazer nada) vs.
`transmission` (saída do modelo). Testado com `α ∈ {0.05, 0.10, 0.15}` nas
duas resoluções de saída disponíveis (320×320 e 640×640).

## Resultado real obtido

| Variante | α | MSE(blended, clean) | MSE(transmission, clean) | Delta |
|---|---|---|---|---|
| 320×320 | 0.05 | 19.9 | 139.7 | −601.9% |
| 320×320 | 0.10 | 75.5 | 178.5 | −136.3% |
| 320×320 | 0.15 | 167.0 | 277.3 | −66.1% |
| 640×640 | 0.05 | 19.9 | 62.3 | −213.1% |
| 640×640 | 0.10 | 75.5 | 131.4 | −74.0% |
| 640×640 | 0.15 | 167.0 | 248.1 | −48.6% |

Em **todas as 6 combinações** a saída do modelo ficou **mais distante** da
cena limpa que simplesmente não corrigir nada — inclusive piorando mais
quanto mais fraco o reflexo sintético. Inspeção visual (`testimgs/`)
confirma: a saída perde detalhe (borrada) e ainda mantém as linhas do
reflexo sintético visíveis.

## Por que não integramos mesmo assim

Diferente do LaMa (inpainting, que passou num teste equivalente com
qualidade real e virou `home_staging.act`), este modelo não passa no teste
mais básico: reduzir a distância até a cena real. Integrá-lo mesmo assim
seria entregar uma capability que piora a imagem em vez de melhorá-la —
viola o princípio deste projeto de nunca simular/fingir uma capability.

## Arquivos não versionados

`.venv/`, `models/*.onnx` (~89MB cada, acima do limite de 100MB só quando
somados) e `testimgs/*.png` intermediários são gitignorados — só o código de
verificação (`verify_onnx.py`) e este README ficam no repositório, pelo
mesmo motivo documentado em `tools/inpainting/README.md`.
