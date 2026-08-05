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

# OBRIGATÓRIO: sem este passo o modelo não carrega em macOS Intel.
python3 patch_dft_irfft.py models/lama_inpainting.onnx models/lama_inpainting.onnx
```

⚠️ **Não pule o `patch_dft_irfft.py`.** O ONNX recém-exportado usa nós
`DFT(inverse=1, onesided=1)`, que o `onnxruntime-node` <=1.23.x rejeita ao
carregar — e essa é a última linha que ainda publica binário pra macOS
Intel. Sem o patch, Home Staging degrada silenciosamente pro `delogo`
nessa plataforma. O script reescreve esses nós com matemática equivalente
(saída bit a bit idêntica, verificada). Ver "O bug de shape inference do
DFT" abaixo e `docs/ml/HOME_STAGING.md`.

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

## O bug de shape inference do DFT (e por que o `patch_dft_irfft.py` existe)

Segundo bug real de runtime, diferente do anterior — este impede o modelo
de **carregar**, não de rodar:

```
Load model from lama_inpainting.onnx failed:
Node (node_DFT_2630) Op (DFT) [ShapeInferenceError]
is_onesided and inverse attributes cannot be enabled at the same time
```

O LaMa gera 36 nós `DFT(inverse=1, onesided=1)` — o `irfft` de cada bloco
de Fast Fourier Convolution. Essa combinação é válida na especificação do
ONNX (é o IRFFT), mas a inferência de shape do ONNX Runtime <=1.23.x a
rejeita. Isso importa muito porque **1.23.x é a última linha que ainda
publica binário pra macOS Intel** (`darwin/x64`) — as versões que
corrigem o bug do DFT removeram esse binário. Verificado que nenhuma
versão publicada tem as duas coisas, incluindo a 1.23.2 (tem Intel, mantém
o bug), e que um sidecar com a 1.27.0 também não resolveria (ela só
publica `darwin/arm64`).

**Solução: corrigir o modelo, não esperar o runtime.** `patch_dft_irfft.py`
reescreve cada nó afetado usando a identidade

```
irfft(X, n)  ==  real( idft( hermitian_full(X, n), n ) )
```

com `hermitian_full` reconstruindo o espectro completo a partir do
"onesided" via simetria hermitiana (`X_full[k] = conj(X[n-k])`). Só usa
operações que o runtime antigo aceita, e mantém `n` dinâmico
(Shape/Range/Gather) — o modelo continua aceitando qualquer resolução.

A semântica exata do operador (entrada `[..., M, 2]` → saída
`[..., n, 1]`, igual a `numpy.fft.irfft`) foi determinada **empiricamente
contra um runtime que a suporta**, não deduzida da documentação — a
especificação não deixa a forma da saída explícita.

Verificado: saída do modelo corrigido × original, no mesmo runtime
moderno, em duas resoluções — diferença máxima **0.000e+00** (bit a bit
idêntico); e o corrigido carrega + roda inferência real no
`onnxruntime-node@1.23.0`, também com diferença zero.

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
