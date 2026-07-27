# Digify Property Studio — Arquitetura

**Versão:** 2.0 (consolidada)
**Status:** Fonte de verdade ativa
**Substitui:** `docs/reference/original-docs/00 - MASTER INDEX.md` e conteúdo divergente dos
demais documentos originais (ver `docs/adr/0001-architecture-foundation-decisions.md`)

Todo desenvolvedor ou agente de IA que trabalhar neste projeto deve ler este documento antes
de qualquer implementação. Ele é o ponto de entrada oficial.

---

## 1. Missão e visão

Construir a principal plataforma de Inteligência Artificial especializada em criação de
conteúdo para o mercado imobiliário. O Digify não é um editor de vídeo — é uma plataforma
que compreende imóveis, interpreta seus atributos e automatiza a produção de materiais de
marketing, evoluindo no longo prazo para um **Property Operating System (Property OS™)**.

## 2. Princípios inegociáveis

* AI First, Desktop First, Offline First, Plugin First, API First, Security First,
  Performance First, User First.
* Simplicidade acima de complexidade; evolução contínua sem ruptura.
* A realidade do imóvel é inviolável: nunca esconder, aumentar, inventar ou alterar
  permanentemente o imóvel.
* Toda decisão de IA relevante deve ser explicável, auditável e reversível.
* Escalabilidade começa no primeiro commit — nunca "arrumar depois".

(Lista completa e não resumida em `docs/reference/original-docs/03 - Core Principles.md`,
que permanece válida na íntegra — nenhuma inconsistência foi encontrada nela.)

## 3. Sem estágio de MVP

Por decisão explícita do produto (ADR-0001), este projeto **não segue um plano de MVP
reduzido**. Construímos a arquitetura final de produção desde o primeiro commit. O que varia
ao longo do tempo é o **número de capabilities implementadas**, não a qualidade ou a forma da
arquitetura. Toda capability nova deve nascer encaixada nesta arquitetura, nunca forçada nela
depois.

O que isso significa na prática:

* As camadas (Domain, Application, PIE™, Infrastructure) são implementadas com o desenho final
  desde o início — não uma versão "simplificada para depois refatorar".
* Capabilities (agentes de IA) são adicionadas incrementalmente, cada uma end-to-end
  (Vision → Decisão → Render → Export), nunca como esqueleto vazio.
* Modelos de IA reais (pesos treinados especificamente para o domínio imobiliário) são um
  workstream separado de dados/treinamento — fora do escopo do que pode ser produzido neste
  ambiente de desenvolvimento. Toda capability é construída atrás de uma interface estável
  (`Capability` contract) para que o modelo real substitua um modelo placeholder sem
  alterações estruturais.

## 4. Fluxo geral da plataforma

```
Usuário → Interface → PIE™ → Capability Registry → Capability → Property Knowledge Graph (PKG™) → Rendering Engine → Export
```

## 5. Arquitetura em camadas (Desktop)

```
                 UI (Presentation Layer)
                          │
                Application Layer (casos de uso)
                          │
                  Domain Layer (regras de negócio)
                          │
        Property Intelligence Engine (PIE™) — orquestração
                          │
   ┌──────────────┬───────┴────────┬──────────────┐
   ▼              ▼                ▼              ▼
Vision Layer  Production Layer  Marketing Layer  Learning Layer
   │              │                │              │
   └──────────────┴───────┬────────┴──────────────┘
                           ▼
                   Quality Layer (gate final)
                           │
                   Rendering Engine (executa, nunca decide)
                           │
                  Infrastructure Layer (SO, GPU, disco, DB)
```

Regras:

* Nenhuma camada acessa outra pulando a hierarquia.
* A UI nunca contém regra de negócio.
* O PIE™ nunca processa vídeo — apenas planeja, prioriza, valida e aprende.
* O Rendering Engine nunca decide — apenas executa o que o PIE™ aprovou.

### 5.1 Correção sobre a "Export Layer" (ADR-0001, item E)

O diagrama original de IA (doc `07`) listava "Export Layer" como uma das seis camadas de
agentes do PIE™, mas nenhum agente de exportação foi definido na especificação de agentes.
**Decisão:** Export não é uma camada de agentes do PIE™. É uma responsabilidade do
**Rendering Engine** (seu `Export Manager`), fora da taxonomia de capabilities de IA. O PIE™
aprova o plano de exportação; quem executa é o Rendering Engine.

## 6. Property Intelligence Engine (PIE™)

Orquestrador central. Responsabilidades: compreender o projeto, criar plano de execução,
distribuir tarefas entre capabilities, resolver conflitos, validar resultados, aprender com
feedback. Nenhuma capability toma decisão isolada — toda decisão passa pelo PIE™, que mantém
o estado global do projeto (single source of truth em runtime).

Sistema de confiança (Confidence Score) aplicado a toda saída de capability:

| Confidence | Ação |
|---|---|
| ≥ 95% | Executa automaticamente |
| 80–95% | Executa e informa o usuário |
| 70–80% | Solicita confirmação |
| < 70% | Não executa |

## 7. Capabilities (agentes de IA)

Ver `docs/CAPABILITY_REGISTRY.md` para o catálogo canônico completo, incluindo a correção do
padrão **Analyze/Act** (ADR-0001, item D) para capabilities que tanto analisam quanto corrigem
(Lighting, Perspective, Reflection).

## 8. Pipeline de processamento (visão resumida)

```
Import → Validação → Pré-processamento → Property Understanding (Vision)
  → Strategic Planning (PIE™) → Processing Queue → Parallel Processing
  → Visual Enhancement (Production) → Narrative Construction → Marketing Generation
  → Quality Validation → Rendering → Export → Learning
```

Detalhes completos e válidos em `docs/reference/original-docs/09 - Video Processing
Pipeline.md` — nenhuma inconsistência estrutural foi encontrada neste documento além do
apontado no item D do ADR-0001.

## 9. Persistência

* **Local:** SQLite. Nunca armazena vídeo — apenas metadados, projetos, cache de resultados de
  IA, preferências. Vídeo permanece no sistema de arquivos.
* **Cloud (fases futuras):** PostgreSQL (dados relacionais), Neo4j (Property Knowledge Graph
  em escala), Redis (cache), OpenSearch (busca). Não implementado nesta fase — ver seção 11.

## 10. IA local: runtime (ADR-0001, item G)

**Decisão:** o Desktop não roda um sidecar Python/FastAPI para inferência local. Toda
inferência local usa **ONNX Runtime via bindings Node** (`onnxruntime-node`), executada em
worker threads dedicadas do processo principal Electron/Node — mantendo um único runtime
(Node/TS) no caminho crítico Offline First. FastAPI (Python) fica reservado exclusivamente
para **Cloud AI** (modelos grandes, treinamento) — nunca no caminho local obrigatório.

## 11. Escopo desta fase de implementação

Construímos o núcleo de produção completo do Desktop:

* Domain Layer + persistência local.
* Event Bus + Dependency Injection.
* PIE™ (orquestrador + Capability Registry).
* Vision pipeline (Intake, Scene, Room, Object — com modelo placeholder plugável).
* Duas capabilities de produção completas de ponta a ponta: Lighting e Color.
* Rendering Engine (modo Standard, fallback CPU).
* Export Manager (MP4/H.264).
* UI: Import, Timeline, Player, Preview, comparação Antes/Depois.

Fora do escopo desta fase (arquitetura já preparada para receber sem redesenho, conforme
Plugin First / Capability Architecture): Home Staging e demais capabilities do catálogo,
Plugin SDK/Marketplace, Cloud (sync, colaboração, render distribuído), Mobile, Digital Twin.
Cada uma entra como uma nova capability registrada no PIE™, sem alterar o núcleo.

## 12. Referências

* Princípios de produto, UX, jornadas, monetização, análise competitiva, roadmap de longo
  prazo e innovation lab permanecem válidos como estão em `docs/reference/original-docs/`.
* Decisões que resolvem inconsistências: `docs/adr/0001-architecture-foundation-decisions.md`.
* Padrões de engenharia: `docs/ENGINEERING_STANDARDS.md`.
* Catálogo de capabilities: `docs/CAPABILITY_REGISTRY.md`.
