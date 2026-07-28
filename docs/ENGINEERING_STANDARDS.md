# Engineering Standards

Preenche a lacuna dos documentos "Development Standards" e "Testing Strategy" citados no
Master Index original mas nunca entregues (ADR-0001, item B).

## Stack

* **Monorepo:** pnpm workspaces + Turborepo.
* **Desktop:** Electron + React 18 + TypeScript (strict) + Vite.
* **UI:** Tailwind CSS + shadcn/ui, seguindo os tokens em `docs/reference/original-docs/16 -
  Design System.md` (documento válido sem alterações).
* **Banco local:** SQLite via `better-sqlite3`, migrations versionadas.
* **Processamento de vídeo determinístico:** FFmpeg/FFprobe reais via `ffmpeg-static` /
  `ffprobe-static` (binários reais, não simulados) — usados para metadados (`intake`) e
  segmentação de cena (`scene.detect`). Não são "IA": são processamento de sinal
  determinístico, por isso essas capabilities sempre reportam confidence 100.
* **IA local (modelos treinados/ML):** `onnxruntime-node` (ver ADR-0001, item G). Nunca
  Python no caminho crítico offline. Ainda não integrado — capabilities que dependem de
  modelo treinado (`room.recognize`, `object.detect`, ...) seguem `planned` em
  `docs/CAPABILITY_REGISTRY.md` até haver um modelo real para plugar.
* **Testes:** Vitest (unit/integration, sempre com vídeos sintéticos reais gerados via
  FFmpeg — nunca arquivos fake/texto disfarçados de vídeo). Playwright + `_electron`
  (`require('playwright')._electron`) para E2E do shell Electron real via CDP.

## Estrutura de camadas (real, não aspiracional)

```
apps/desktop/
  src/
    main/            # processo principal Electron — cria janela, registra IPC
    preload/          # contextBridge — SEMPRE build para .cjs (ver nota abaixo)
    renderer/          # UI React (presentation) — nunca contém regra de negócio
    application/         # casos de uso, coordena fluxos, nunca decide IA
    infrastructure/        # capabilities concretas, ffmpeg, composition root (bootstrap.ts)
packages/
  domain/              # entidades, regras de negócio, Repository interfaces (compartilhado)
  database/             # implementação SQLite dos repositories
  pie/                   # orquestrador, Capability Registry, Event Bus
```

`vision/`, `production/`, `render/`, `design-system/` como pacotes próprios ainda não existem
— as capabilities atuais vivem em `apps/desktop/src/infrastructure/capabilities/` porque só
há duas. Extrair para pacotes é um refactor futuro quando o número de capabilities justificar
(evitar abstração prematura).

Regra de dependência: `renderer → application → domain ← infrastructure`. `domain` (em
`packages/domain`) nunca importa de `infrastructure` ou `renderer`. Módulos só se comunicam
através de contratos de evento (`@digify/pie`) — nunca import direto entre capabilities.

## Preload do Electron: sempre `.cjs`, nunca `.js`/`.mjs`

Como `apps/desktop/package.json` tem `"type": "module"`, um preload `.js` é tratado como ESM
pelo Node — e Electron carrega preload via `require()`, que falha com `ERR_REQUIRE_ESM`
**silenciosamente para o usuário** (só aparece no evento `webContents.on('preload-error', ...)`,
nunca no console padrão nem trava a aplicação — a UI carrega normalmente, só `window.digify`
fica `undefined`). `electron.vite.config.ts` força `output.format: "cjs"` +
`entryFileNames: "[name].cjs"` para o build de preload. Mantenha o listener de
`preload-error` em `main/index.ts` permanentemente — é a única forma confiável de detectar
essa classe de erro em produção.

## Padrão de commit e revisão

* Nunca implementar grandes mudanças de uma vez. Cada commit deve manter o projeto compilando
  e os testes passando.
* Toda capability nova precisa: contrato de entrada/saída, testes unitários do
  `domain`, teste de integração no PIE™, registro em `docs/CAPABILITY_REGISTRY.md`.
* Toda mudança estrutural relevante gera um ADR novo em `docs/adr/`.

## better-sqlite3: ABI Node vs. Electron

`better-sqlite3` é um módulo nativo. O binário compilado precisa bater com o ABI de quem o
carrega:

* **Testes (`pnpm test`, Vitest sob Node puro):** ABI do Node — padrão após `pnpm install`.
* **App Electron (`pnpm dev` / `pnpm build` + executar o binário):** ABI do Electron —
  rodar `pnpm --filter @digify/desktop rebuild:electron` antes.

Alternar de volta para testar: `pnpm --filter @digify/desktop rebuild:node`. Isso é uma
característica normal de módulos nativos em apps Electron, não um bug — mas gera um erro
enganoso (`Module did not self-register` / `NODE_MODULE_VERSION` mismatch) se esquecido.
Descoberto e documentado durante a verificação end-to-end real do vertical slice de import
(lançamento do Electron via `xvfb-run` nesta mesma sessão).

## Testes — metas mínimas

* Domain Layer: cobertura ≥ 90%.
* Casos críticos do PIE™ (resolução de conflito, confidence gating, failover): 100%.
* Toda capability: pelo menos um teste de "confidence baixo → não executa automaticamente".

## Segurança básica (mesmo antes do Security Architecture completo)

* Nenhum segredo em código-fonte.
* SQLite local sempre em diretório de dados do usuário, nunca no repositório.
* Nenhum dado de telemetria enviado sem opt-in explícito (ainda não implementado nesta fase —
  não implementar coleta "silenciosa").

## Internacionalização

Nenhuma string de UI hardcoded — usar chaves de tradução desde o primeiro componente, mesmo
com apenas `pt-BR` implementado.
