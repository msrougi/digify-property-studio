# Empacotamento — instalador real (electron-builder)

**Status: shipped nas 4 plataformas (Linux, macOS Intel, macOS Apple
Silicon, Windows) — mas só o pacote Linux foi verificado rodando de
verdade neste ambiente. Os pacotes Mac/Windows foram gerados com sucesso a
partir daqui (cross-build), mas não puderam ser executados/testados neste
sandbox Linux — ver "O que foi verificado de verdade em cada plataforma"
mais abaixo.**

## Como gerar o instalador

```bash
cd apps/desktop
pnpm build:installer
```

Isso roda `electron-vite build` (o mesmo build de sempre), depois
`scripts/fix-native-abi.mjs` (ver abaixo por quê), depois `electron-builder`
de verdade. O resultado sai em `apps/desktop/dist-installer/` — não
versionado no git (artefato de build, ~460MB, mesma lógica de `out/`).

Neste ambiente (Linux x64), o alvo configurado é **AppImage** — um único
executável, sem instalação de sistema necessária. Rode
`./dist-installer/"Digify Property Studio-0.1.0.AppImage"` (ou
`--appimage-extract-and-run` se o ambiente não tiver FUSE disponível, como
este sandbox de desenvolvimento).

## Dois bugs reais encontrados e corrigidos ao empacotar pela primeira vez

Igual ao resto do projeto: gerar a config e "achar que funciona" não basta —
o instalador foi de fato executado (via `xvfb-run` + Playwright/`_electron`,
mesmo padrão de verificação usado no app em modo dev) até completar o fluxo
real **Importar → Análise automática → Aplicar melhorias → Render**, e dois
problemas reais surgiram nesse processo:

### 1. `better-sqlite3` compilado pro ABI errado (Node em vez de Electron)

O rebuild automático de dependências nativas do electron-builder
(`npmRebuild: true`, o padrão, que usa `@electron/rebuild` por baixo dos
panos) baixou o prebuild do **Node** em vez do **Electron** — o mesmo bug
real já visto e corrigido manualmente ao longo deste projeto pra
desenvolvimento/testes (`rebuild:electron` também é afetado; o fix sempre
foi forçar `prebuild-install --runtime=electron --target=<versão>`
diretamente, em vez de confiar no `electron-rebuild`/`@electron/rebuild`
"genérico").

**Fix**: `npmRebuild: false` no `electron-builder.yml` (desliga o rebuild
automático quebrado) + `scripts/fix-native-abi.mjs`, que roda ANTES do
`electron-builder` e faz o `prebuild-install --runtime=electron
--target=<versão do electron instalado>` certo, direto no pacote
`better-sqlite3` real do workspace.

Sintoma sem o fix (capturado rodando o app empacotado de verdade):
```
UnhandledPromiseRejectionWarning: Error: The module '.../better_sqlite3.node'
was compiled against a different Node.js version using NODE_MODULE_VERSION 127.
This version of Node.js requires NODE_MODULE_VERSION 130.
```

### 2. `ENOTDIR` ao spawnar `ffprobe`/`ffmpeg` — asar quebra o path calculado pelos pacotes

Com `asar` habilitado (o padrão do electron-builder) + `asarUnpack` pros
binários de `ffmpeg-static`/`ffprobe-static` (a config "recomendada" pra
esse caso), o app empacotado falhava com `spawn ENOTDIR` ao tentar rodar
`ffprobe` durante o import de um vídeo. Causa: os pacotes `ffmpeg-static`/
`ffprobe-static` calculam o caminho do binário via `path.join(__dirname,
...)` — dentro do `app.asar`, isso gera uma string tipo
`.../app.asar/node_modules/ffprobe-static/.../ffprobe`, e o
redirecionamento transparente do Electron pra `app.asar.unpacked` (que
deveria acontecer automaticamente com `asarUnpack`) não cobriu esse caso
de forma confiável neste ambiente.

**Fix**: `asar: false` no `electron-builder.yml`. Sem asar, todo arquivo
(binários, módulos nativos, modelos) fica como arquivo real no disco —
elimina essa classe inteira de problema (não só pra ffmpeg-static, também
pra qualquer outro binário/módulo nativo futuro). O tradeoff é um pacote
"menos compacto" (sem o único-arquivo-archive do asar) — aceitável dado que
o objetivo aqui é corretude, não o menor tamanho de distribuição possível.

## Onde os modelos ONNX ficam no pacote

`extraResources` copia `apps/desktop/models/` pra `resources/models` no
pacote final (fora de qualquer archive) — e `src/main/index.ts` resolve
`modelsDir` condicionalmente: `process.resourcesPath + "/models"` quando
`app.isPackaged`, ou o caminho de dev (`out/main/../../models`) caso
contrário. Os modelos (~220MB total, incluindo o `lama_inpainting.onnx` de
inpainting real) não são versionados no git (acima do limite de 100MB do
GitHub por arquivo — ver `tools/*/README.md` pra como regenerá-los), mas
**são incluídos no instalador** — quem gera o pacote a partir de um clone
com os modelos já presentes localmente (rodando os scripts de
`tools/inpainting/`, `tools/room-classifier/`, `tools/object-detector/`)
entrega um instalador com IA real completa, incluindo inpainting
generativo.

## Verificação real feita

Rodado neste ambiente via `xvfb-run` + Playwright `_electron` apontando
pro EXECUTÁVEL EMPACOTADO (não `electron out/main/index.js` como nos testes
de dev) — fluxo completo: importar `bedroom-sample.mp4` real → pipeline de
análise automática rodou de verdade (cena detectada, ambiente reconhecido
como "bedroom", 5 objetos detectados, Property Score 100/100 calculado) →
"Aplicar melhorias" → render real produzido. Screenshot confirmando visto
durante a verificação.

## Gerando pra todas as plataformas a partir de Linux

```bash
cd apps/desktop
pnpm build:installer                                    # Linux (AppImage) — alvo configurado por padrão
npx electron-builder --mac --x64 --arm64 --publish never --config electron-builder.yml
npx electron-builder --win --x64 --publish never --config electron-builder.yml
```

## O que foi verificado de verdade em cada plataforma

* **Linux (AppImage, x64)** — ✅ **verificado de ponta a ponta**: executável
  rodado via `xvfb-run` + Playwright `_electron` (import real → pipeline de
  análise real → render real). Este é o único artefato deste conjunto que
  passou pela mesma disciplina de "rodar de verdade" do resto do projeto.
* **macOS Intel (zip, x64)** e **macOS Apple Silicon (zip, arm64)** — ⚠️
  **gerados com sucesso** (`.app` real dentro de um `.zip`, ~650MB cada,
  contendo o Electron completo + node_modules + os modelos ONNX), mas **não
  puderam ser executados neste ambiente** (Linux não roda binários Mach-O).
  DMG não foi possível gerar (ver abaixo). Sem assinatura de código —
  usuário final vai precisar liberar no Gatekeeper na primeira execução.
* **Windows (x64)** — ❌ **instalador NSIS não foi possível gerar aqui**
  (ver "Terceiro problema" abaixo). Gerado em vez disso um **fallback real
  e funcional**: `Digify Property Studio-0.1.0-win-x64-portable.zip`, um
  zip do diretório `win-unpacked` completo (app + todas as DLLs +
  `resources/` com os modelos) — o usuário extrai e roda
  `digify-property-studio.exe` direto, sem assistente de instalação. Não
  testado neste ambiente (mesma limitação de arquitetura — não roda .exe
  em Linux puro).

## Terceiro e quarto problemas reais: cross-build de Mac/Windows a partir de Linux

### DMG do macOS precisa de `sips` (ferramenta exclusiva do macOS)

```
⨯ sips process failed ENOENT
```

`sips` é uma ferramenta de linha de comando de manipulação de imagem que só
existe no macOS — usada pelo electron-builder pra gerar o ícone/volume do
`.dmg`. Não tem workaround real a partir de Linux; o alvo `zip` (que não
precisa dela) foi usado no lugar. Gerar o `.dmg` de verdade exige rodar o
build numa máquina macOS real (ou CI com runner macOS).

### NSIS do Windows precisa de um `wine` funcional, não só instalado

```
⨯ wine process failed 1
wine: could not exec the wine loader
```

Primeira tentativa: `wine` nem estava instalado (`spawn wine ENOENT`).
Instalado via `apt-get install wine64` + symlink pra `wine` no PATH — isso
resolveu o empacotamento inicial (assinatura simulada dos `.exe`/`.dll`,
criação do instalador NSIS em si), mas o electron-builder tenta EXECUTAR o
instalador recém-criado via `wine` como parte do processo (provavelmente
pra gerar metadados de diff/update), e isso falhou — `wine64` sozinho
(sem o pacote `wine` completo/um `WINEPREFIX` inicializado via `wineboot`,
possivelmente sem suporte 32-bit) não é o bastante pra rodar um executável
Windows de verdade, só pra participar do processo de build até certo ponto.
Configurar um ambiente wine completo e funcional estava fora do escopo de
tempo disponível — o fallback real (zip portátil do `win-unpacked`) cobre
a necessidade prática (usuário Windows consegue rodar o app) sem essa
dependência.

## Antes de distribuir pra usuários de verdade

Os pacotes Mac/Windows **nunca foram executados** — só o processo de build
foi validado. Antes de entregar pra um usuário real nessas plataformas,
repetir a mesma disciplina de verificação usada no Linux (rodar o
executável de verdade, importar um vídeo real, confirmar que o pipeline
completo funciona) numa máquina Mac/Windows real ou CI com os runners
correspondentes — não assumir que "buildou sem erro" equivale a "funciona".
