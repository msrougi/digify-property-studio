# Home Staging — `home_staging.act`

**Status: shipped com inpainting generativo real (LaMa) — fallback `delogo` só quando o modelo não está disponível localmente.**

## Atualização importante — correção de uma conclusão anterior

Uma versão anterior deste documento dizia que "nenhum modelo de inpainting
real tinha pesos hospedados em host acessível neste ambiente" e que o
fallback `delogo` era "o melhor resultado real disponível". Isso estava
**errado** — uma busca mais insistente encontrou o LaMa (o modelo mais
relevante da área) hospedado de verdade em GitHub Releases, e o pipeline
completo (download → conversão para ONNX → inferência real) funciona neste
ambiente. Documentado aqui como lição: "não encontrei" não significa
"não existe" — vale insistir antes de concluir que algo é inviável.

## O que o catálogo original pedia

docs/reference/original-docs/08 - AI Agents.md descreve "AI Home Staging"
como capaz de remover itens temporários (roupas, sacolas, baldes, caixas,
fios, brinquedos) mantendo a remoção sempre reversível — exige um modelo de
**inpainting generativo** (preencher a região com conteúdo plausível, não
só apagar). Isso agora está implementado de verdade.

## O modelo real: LaMa

* **Modelo**: [LaMa](https://github.com/advimman/lama) (Resolution-robust
  Large Mask Inpainting with Fourier Convolutions, WACV 2022) — o modelo
  mais citado/relevante da área de inpainting generativo.
* **Licença**: Apache 2.0 — uso comercial livre.
* **Pesos**: checkpoint TorchScript original (`big-lama.pt`, ~196MB),
  hospedado em **GitHub Releases** por
  [Sanster/models](https://github.com/Sanster/models) (mesmo autor do
  IOPaint/lama-cleaner, MIT) —
  `https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt`,
  MD5 `e3aa4aaa15225a33ec84f9f4bc47e500`. Diferente de todos os outros
  candidatos de inpainting pesquisados (MirrorNet-style, MI-GAN, Moebius —
  todos só em Google Drive/Hugging Face), este está em GitHub Releases,
  acessível neste ambiente.

## Da descoberta ao modelo funcionando: dois obstáculos técnicos reais

Não foi só "baixar e usar" — dois problemas reais de engenharia precisaram
ser resolvidos, documentados em detalhe em `tools/inpainting/README.md`:

1. **Exportar para ONNX**: o LaMa usa Fast Fourier Convolutions
   (`aten::fft_rfftn`/`fft_irfftn`), que o exportador legado do PyTorch não
   sabe converter, e o exportador moderno ("dynamo") não aceita um
   `ScriptModule` já compilado diretamente. Caminho que funciona:
   `torch.jit.load` → `TS2EPConverter` (converte pra `ExportedProgram`) →
   exportador dynamo (decompõe as FFTs em nós `DFT` nativos do ONNX
   opset 17+).
2. **Bug real de runtime no ONNX Runtime**: o `.onnx` resultante passa no
   `onnx.checker` mas falha ao rodar com as otimizações de grafo padrão —
   um bug de reaproveitamento de buffer nos nós `DFT`, mesmo na resolução
   exata do trace. Workaround: `graphOptimizationLevel: 'disabled'`
   (`onnxruntime-node`) — com isso, a saída bate com o TorchScript original
   (diferença máxima ~1e-4, ruído de ponto flutuante), verificado em 4
   resoluções diferentes.

## Como funciona de verdade (`HomeStagingActCapability.ts`)

1. Calcula a união das caixas dos objetos temporários da cena + margem de
   contexto (48px) — o LaMa precisa de pixels de vizinhança pra gerar um
   preenchimento plausível, uma caixa justa ao objeto o famintaria de
   contexto.
2. Recorta essa região do vídeo no frame representativo da cena (FFmpeg),
   com padding até múltiplo de 8 (`pad_mod` do LaMa).
3. Roda a inferência real via `onnxruntime-node`.
4. Escreve o recorte gerado como PNG real (FFmpeg).
5. Devolve um **overlay** — não um filtro `-vf` simples: compor uma imagem
   gerada sobre o vídeo original precisa de um filter_complex de verdade
   (`RenderingEngine.ts` ganhou suporte a overlays de imagem estática com
   janela de tempo, além da cadeia simples de filtros que já tinha).

Pixels fora da máscara do objeto ficam bit-a-bit idênticos ao original
(confirmado no grafo do modelo: `output = mask*gerado + (1-mask)*original`)
— só a região do objeto muda, o resto do recorte é seguro pra compor de
volta sem alterar nada ao redor.

## Fallback honesto quando o modelo não está disponível

`lama_inpainting.onnx` tem ~196MB — acima do limite de 100MB por arquivo do
GitHub, então **não é versionado no repositório** (ver
`tools/inpainting/README.md` pra gerar localmente). Sem o arquivo,
`HomeStagingActCapability` cai automaticamente no fallback clássico
`delogo` (interpolação de vizinhança) documentado antes — real, mas
inferior ao inpainting generativo. O mesmo vale se a inferência falhar por
qualquer motivo real (memória, resolução extrema): nunca quebra o render
inteiro, sempre cai pro fallback.

## Decisão de confidence

A capability retorna confidence **75** de propósito (tanto no caminho real
quanto no fallback) — cai na faixa "confirm" (docs/00-ARCHITECTURE.md,
seção 6), nunca "auto". Mesmo sendo geração real, é uma alteração visível
de conteúdo — o usuário sempre confirma antes de aplicar.

## Verificação feita

* Python: saída do ONNX bate com o TorchScript original em 4 resoluções
  diferentes (`tools/inpainting/verify_onnx.py`).
* TypeScript: pipeline completo (`extractCropForInpainting` → tensores →
  `onnxruntime-node` → `writeRgbToPng`) rodado de ponta a ponta via o
  código de produção real, com **prova visual**: um retângulo vermelho
  colocado de propósito sobre uma textura foi removido de verdade e
  substituído por uma continuação plausível do padrão de fundo (não é
  blur, é geração de conteúdo coerente com a vizinhança).
* `RenderingEngine`: teste real de composição de overlay (patch branco
  sobre vídeo preto), confirmando via medição de luma que o overlay aparece
  só na região e janela de tempo certas.
* Suite completa: 100+ testes automatizados cobrindo cada peça pura
  (tensores, máscara, união de caixas, recorte, PNG) sem precisar do
  modelo de 196MB — só o fallback `delogo` roda em CI/`pnpm test`, já que o
  modelo não está versionado. A inferência real em si não tem cobertura
  automatizada permanente (não dá pra versionar o modelo) — verificada
  manualmente nesta sessão com o modelo presente localmente, documentado
  aqui como limitação honesta de cobertura de teste.

## Bug real encontrado testando num vídeo de imóvel de verdade: patch estático sobre câmera em movimento

Exatamente o risco que a seção "Caminho futuro" (abaixo, versão anterior
deste documento) já apontava como não resolvido: um usuário testou o app
real num vídeo de passeio por um imóvel (câmera andando pela cena, comum
em vídeo imobiliário) e reportou "criou um vídeo com uma imagem estática,
não removeu nada" — tanto `home_staging.act` (caminho de inpainting real)
quanto `reflection.act` geram a correção a partir de **um único frame** e
compõem essa imagem, parada, sobre a janela de tempo inteira da cena. Com
câmera parada isso é imperceptível; com câmera em movimento, vira um
"adesivo" óbvio colado sobre um vídeo que muda de enquadramento.

**Fix real aplicado**: `detectCameraMotion.ts` mede a diferença real de
luma (MAD, mean absolute difference) entre um frame do início e um do fim
da cena (com margem, pra não pegar frame de transição de corte) — nunca
assume, sempre mede. `RenderPreviewUseCase` roda essa medição por cena
antes de chamar `reflection.act`/`home_staging.act` e passa o resultado
via `sceneIsStatic`. Com câmera em movimento (`sceneIsStatic: false`):

* `reflection.act` pula a correção nessa cena (overlay `null`), com
  descrição explicando por quê.
* `home_staging.act` pula a tentativa de inpainting real (mesmo com o
  modelo disponível) e usa direto o fallback `delogo` — que recalcula por
  frame, então não tem esse problema de "colar" um frame só.

Isso não é a solução ideal (tracking de câmera + reprocessamento por
frame, descrita abaixo, seria mais completa) mas é real, honesta e resolve
o sintoma mais grave (o "adesivo" óbvio) com custo de implementação e
performance viáveis agora.

## RESOLVIDO: o conflito Mac Intel × LaMa (corrigindo o modelo, não o runtime)

**Status: resolvido.** A seção abaixo descreve o impasse original; esta
descreve a solução real, já aplicada e verificada.

O impasse era: `onnxruntime-node` <=1.23.x é a última linha com binário pra
macOS Intel, mas rejeita os nós `DFT(inverse=1, onesided=1)` que o LaMa gera
nas suas Fast Fourier Convolutions. As versões que corrigem esse bug
removeram o binário Intel. Confirmado que **nenhuma** versão publicada
serve pras duas coisas — inclusive a 1.23.2, que eu testei depois e tem
binário Intel mas mantém o mesmo bug.

**A saída foi parar de esperar um runtime e corrigir o próprio modelo.** O
`irfft` (o que aquela combinação de atributos representa) pode ser escrito
com operações que o runtime antigo aceita, sem mudar a matemática:

```
irfft(X, n)  ==  real( idft( hermitian_full(X, n), n ) )
```

onde `hermitian_full` reconstrói o espectro completo a partir do "onesided"
usando a simetria hermitiana de um sinal real (`X_full[k] = conj(X[n-k])`).
`tools/inpainting/patch_dft_irfft.py` aplica essa reescrita nos 36 nós
afetados, com comprimento `n` dinâmico (via Shape/Range/Gather — nenhuma
resolução fixa é assumida, o modelo continua aceitando qualquer tamanho).

A semântica exata de `DFT(inverse=1, onesided=1)` (entrada `[..., M, 2]` →
saída `[..., n, 1]`, equivalente a `numpy.fft.irfft`) foi determinada
**empiricamente contra um runtime que a suporta**, não deduzida da
especificação — a documentação do operador não deixa isso explícito.

### Verificação

* Modelo corrigido × original, mesmo runtime moderno, duas resoluções
  diferentes (256 e 320): diferença máxima **0.000e+00** — bit a bit
  idêntico, não "aproximadamente igual".
* Modelo corrigido **carrega e roda inferência real** no
  `onnxruntime-node@1.23.0` (a versão com binário Mac Intel), com saída
  também bit a bit idêntica à referência.
* `HomeStagingActCapability.test.ts` agora **exige** `usedRealInpainting`
  — se isso regredir, o teste quebra em vez de degradar em silêncio pro
  `delogo`.

### Efeito prático

Home Staging usa inpainting generativo real (LaMa) em Mac Intel, Apple
Silicon, Linux e Windows — sem sidecar, sem duas versões de runtime, sem
processo separado. `onnxruntime-node` segue fixado em 1.23.0 (o app abre
em Intel) e o modelo carrega normalmente.

## O impasse original (histórico): `onnxruntime-node` 1.23.0 × LaMa

Descoberto investigando o mesmo relato acima: além do problema de câmera
em movimento, o modelo LaMa **não carrega de jeito nenhum** com a versão
de `onnxruntime-node` atualmente fixada no projeto (`1.23.0` — necessária
pra corrigir um crash real em Mac Intel, ver `docs/PACKAGING.md`, "Quinto
problema real"):

```
Load model from lama_inpainting.onnx failed:
Node (node_DFT_2630) Op (DFT) [ShapeInferenceError]
is_onesided and inverse attributes cannot be enabled at the same time
```

Confirmado isolando a variável: o **mesmo** arquivo `.onnx` carrega sem
erro no Python `onnxruntime` 1.28.0 e também no `onnxruntime-node` 1.27.0
(testado diretamente, fora do projeto) — só falha na 1.23.0. É um bug real
de shape inference do ONNX Runtime pra essa combinação específica e válida
de atributos do nó `DFT` (usada pelo LaMa nas suas Fast Fourier
Convolutions), corrigido em alguma versão entre 1.24.0 e 1.27.0 —
exatamente a mesma janela de versões em que a Microsoft **removeu** o
binário pré-compilado de macOS Intel (`darwin/x64`) do pacote (ver
`docs/PACKAGING.md`). Ou seja: **não existe hoje nenhuma versão publicada
de `onnxruntime-node` que sirva pras duas coisas ao mesmo tempo** — Mac
Intel precisa de `<=1.23.0`, o modelo LaMa precisa de `>=~1.24.0`.

**Efeito prático**: no Mac Intel do usuário (e em qualquer build fixado em
`onnxruntime-node@1.23.0`), `home_staging.act` **nunca consegue usar o
modelo LaMa real**, mesmo com o arquivo `lama_inpainting.onnx` presente —
`isModelAvailable()` retorna `true`, a tentativa acontece de verdade, mas
`ort.InferenceSession.create()` sempre lança essa exceção, capturada pelo
`catch` existente, caindo pro fallback `delogo` automaticamente (não
quebra o render, mas nunca entrega a qualidade de IA generativa
prometida). Isso é diferente do problema de câmera em movimento acima —
mesmo numa cena 100% estática, o resultado no Mac Intel hoje é sempre
`delogo`, nunca o LaMa real.

As opções consideradas na época, e o que aconteceu com cada uma:

1. Aceitar a degradação em Mac Intel até a Microsoft republicar o binário
   `darwin/x64` numa versão com o fix — foi o estado por um tempo.
2. Procurar uma versão que tivesse as duas coisas. **Verificado depois:
   não existe.** Além de 1.24.0/1.25.1/1.26.0/1.27.0 (nenhuma com
   `darwin/x64`), testei a 1.23.2 — essa TEM binário Intel, mas mantém o
   mesmo bug do DFT.
3. Rodar duas versões lado a lado (sidecar). **Verificado: não funciona
   pra esse caso.** A 1.27.0 só publica `darwin/arm64`, então um processo
   separado usando ela continuaria sem rodar em Mac Intel.

Nenhuma das três resolvia. A saída real foi uma quarta opção, que não
estava nesta lista: **corrigir o modelo em vez do runtime** — ver a seção
"RESOLVIDO" no topo.

## Caminho futuro

Linhas verticais/distorção de lente e outras melhorias de Perspective
seguem em aberto. Resolver o conflito de versão do `onnxruntime-node`
acima (pra restaurar LaMa real em Mac Intel) e, complementarmente, rodar o
mesmo LaMa por cena com tracking de câmera real (reprocessar conforme o
enquadramento muda, em vez de só pular a cena quando há movimento) melhora
a robustez em vídeos com movimento de câmera mais agressivo — não
implementado ainda.
