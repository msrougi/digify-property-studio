# Engineering Standards

Preenche a lacuna dos documentos "Development Standards" e "Testing Strategy" citados no
Master Index original mas nunca entregues (ADR-0001, item B).

## Stack

* **Monorepo:** pnpm workspaces + Turborepo.
* **Desktop:** Electron + React 18 + TypeScript (strict) + Vite.
* **UI:** Tailwind CSS + shadcn/ui, seguindo os tokens em `docs/reference/original-docs/16 -
  Design System.md` (documento válido sem alterações).
* **Banco local:** SQLite via `better-sqlite3`, migrations versionadas.
* **IA local:** `onnxruntime-node` (ver ADR-0001, item G). Nunca Python no caminho crítico
  offline.
* **Testes:** Vitest (unit/integration), Playwright (E2E do shell Electron quando aplicável).

## Estrutura de camadas (obrigatória)

```
apps/desktop/
  src/
    presentation/   # UI, janelas, painéis — nunca contém regra de negócio
    application/     # casos de uso, coordena fluxos, nunca decide IA
    domain/          # entidades, regras de negócio, Repository interfaces
    infrastructure/  # SQLite, sistema de arquivos, SO, GPU
packages/
  pie/               # orquestrador, Capability Registry, Event Bus
  vision/             # capabilities Vision (somente leitura)
  production/          # capabilities Production (mutating, reversível)
  render/               # Rendering Engine + Export Manager
  design-system/        # componentes e tokens compartilhados
```

Regra de dependência: `presentation → application → domain ← infrastructure`. `domain` nunca
importa de `infrastructure` ou `presentation`. `pie`, `vision`, `production`, `render` só se
comunicam através de contratos de evento — nunca import direto entre si.

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
