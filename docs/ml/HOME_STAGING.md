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

## Caminho futuro

Linhas verticais/distorção de lente e outras melhorias de Perspective
seguem em aberto. Pra Home Staging especificamente: rodar o mesmo LaMa por
cena com tracking de câmera (em vez de um patch estático por cena) melhora
a robustez em vídeos com movimento de câmera mais agressivo — não
implementado ainda.
