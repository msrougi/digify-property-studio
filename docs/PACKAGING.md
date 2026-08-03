# Empacotamento — instalador real (electron-builder)

**Status: shipped e verificado de verdade neste ambiente (Linux/AppImage) —
não é só uma config que "deveria funcionar".**

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

## Limitação honesta: só Linux/AppImage foi verificado

Este ambiente de desenvolvimento é Linux x64 — o `electron-builder.yml`
também aceita configuração `mac`/`win` (DMG/NSIS), e a arquitetura do
projeto não impede gerar esses alvos, mas **não foram testados aqui**
(precisam rodar numa máquina macOS/Windows real, ou CI com os runners
correspondentes, pra fazer sentido — cross-building um `.dmg`/`.exe`
funcional a partir de Linux tem limitações reais do próprio
electron-builder, principalmente assinatura de código). Antes de distribuir
pra usuários Mac/Windows, repetir esse mesmo processo de verificação
(gerar o pacote de verdade, rodar o executável de verdade, não só confiar
na config) nessas plataformas.
