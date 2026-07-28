# Inpainting real (LaMa) — pipeline de exportação para ONNX

Isso corrige uma conclusão anterior deste projeto: `docs/ml/HOME_STAGING.md`
dizia que "todos os modelos de inpainting real (...) têm pesos hospedados
só no Google Drive/Hugging Face, inacessíveis neste ambiente". Isso valia
para os candidatos pesquisados na época (MirrorNet-style academic repos),
mas o **LaMa** (o modelo mais relevante e mais citado da área, WACV 2022,
Apache 2.0) tem uma exceção real: o [Sanster/models](https://github.com/Sanster/models)
(mesmo autor do IOPaint/lama-cleaner) hospeda o checkpoint TorchScript
original **em GitHub Releases** — acessível neste ambiente.

## Passo a passo

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python3 download_model.py   # baixa + verifica MD5 de big-lama.pt (~196MB)
python3 export_onnx.py      # TorchScript -> ExportedProgram -> ONNX
python3 verify_onnx.py      # confere saída idêntica ao TorchScript em várias resoluções
```

Resultado: `models/lama_inpainting.onnx` (~196MB — não versionado no git, ver
"Por que o .onnx não está no repositório" abaixo). Copie manualmente para
`apps/desktop/models/lama_inpainting.onnx` antes de rodar o app Desktop com
inpainting real habilitado (sem o arquivo, `HomeStagingActCapability` cai de
volta no fallback `delogo` documentado em `docs/ml/HOME_STAGING.md`).

## O obstáculo técnico real (e como foi resolvido)

O LaMa usa Fast Fourier Convolutions — internamente chama
`aten::fft_rfftn`/`aten::fft_irfftn`. Isso quebra em duas etapas:

1. **Exportador legado do PyTorch** (`torch.onnx.export(..., dynamo=False)`,
   baseado em tracing de TorchScript): não tem conversor registrado para
   `aten::fft_rfftn` em nenhum opset — `UnsupportedOperatorError`.
2. **Exportador dynamo direto** (`torch.onnx.export(model, ..., dynamo=True)`
   com o modelo TorchScript carregado via `torch.jit.load`): falha antes
   disso — `torch.export` não consegue re-exportar um `ScriptModule` já
   compilado (`ValueError: Exporting a ScriptModule is not supported`).

**Caminho que funciona**: primeiro converter o TorchScript para
`ExportedProgram` via `torch._export.converter.TS2EPConverter` (utilitário
oficial do PyTorch pensado exatamente para isso), e só então rodar o
exportador dynamo nesse `ExportedProgram`. O dynamo consegue decompor
`fft_rfftn`/`fft_irfftn` em nós `DFT` nativos do ONNX (opset 17+), o que o
tracer legado não sabe fazer.

## O bug de runtime real (e o workaround)

O `.onnx` resultante passa em `onnx.checker.check_model` (grafo
estruturalmente válido) mas **falha ao rodar no ONNX Runtime com as
otimizações de grafo padrão** — inclusive na resolução exata usada no
trace, não é um problema de shape dinâmico:

```
[E:onnxruntime] Non-zero status code returned while running DFT node.
Shape mismatch attempting to re-use buffer. {1,192,32,17,1} != {1,192,32,32,1}
```

Isso é um bug real de uma otimização de reaproveitamento de buffer do ONNX
Runtime especificamente para os nós `DFT` (17 = saída "onesided" da RFFT,
32 = tamanho completo — a otimização tenta reusar um buffer com o shape
errado). **Workaround**: desabilitar as otimizações de grafo na sessão —
`GraphOptimizationLevel.ORT_DISABLE_ALL` em Python, ou
`graphOptimizationLevel: 'disabled'` no `onnxruntime-node` (TypeScript, o
runtime usado pelo Desktop). Com isso, a saída bate com o TorchScript
original com diferença máxima ~1e-4 (ruído de ponto flutuante), verificado
em 4 resoluções diferentes por `verify_onnx.py`.

Custo do workaround: inferência mais lenta (grafo não otimizado/fundido).
Aceitável aqui porque `home_staging.act` roda uma vez por cena (frame
representativo), não por frame de vídeo.

## Por que o `.onnx` não está no repositório

`lama_inpainting.onnx` tem ~196MB — acima do limite de 100MB por arquivo do
GitHub. Diferente de `mobilenetv2-12.onnx`/`room_classifier_head.onnx`/
`yolox_nano.onnx` (pequenos, versionados em `apps/desktop/models/`), este
precisa ser gerado localmente (ou baixado/reexportado via este pipeline)
antes de rodar o app com inpainting real — `HomeStagingActCapability`
detecta a ausência do arquivo e usa o fallback `delogo` automaticamente,
nunca quebra.

## Licença

LaMa ([advimman/lama](https://github.com/advimman/lama)) é Apache 2.0 — uso
comercial livre. `Sanster/models` (hospedagem do checkpoint) também é MIT.
