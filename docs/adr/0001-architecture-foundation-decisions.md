# ADR-0001 — Decisões fundacionais e resolução de inconsistências

**Status:** Aceito
**Data:** 2026-07-27

## Contexto

O pacote de 23 documentos originais (`docs/reference/original-docs/`) define a visão de
produto e arquitetura do Digify Property Studio. Uma leitura completa identificou sete
inconsistências que precisavam de decisão explícita antes do início da implementação. Este
ADR registra cada uma e a decisão tomada, substituindo a necessidade do arquivo
`99-ARCHITECTURAL_DECISIONS.md` citado (mas nunca entregue) no Master Index original.

Decisão de escopo adicional do produto: **não haverá fase de MVP**. A implementação começa
direto na forma de arquitetura de produção (ver `docs/00-ARCHITECTURE.md`, seção 3).

## Decisões

### A — Numeração do Master Index não corresponde aos arquivos reais

O Master Index descrevia um mapa de 23 documentos (ex.: 04=System Architecture,
08=Data Architecture, 09=Security Architecture) que não bate com os arquivos entregues
(04=PRD, 08=AI Agents, 09=Video Processing Pipeline).

**Decisão:** abandonar a numeração como mecanismo de referência. A documentação ativa
(`docs/00-ARCHITECTURE.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/ENGINEERING_STANDARDS.md`)
usa nomes descritivos, não números. Os documentos originais permanecem com seus nomes de
arquivo originais em `docs/reference/original-docs/` apenas como histórico.

### B — Documentos referenciados mas ausentes (`99-ARCHITECTURAL_DECISIONS.md`, Testing
Strategy, Development Standards)

**Decisão:** este diretório `docs/adr/` cumpre o papel do arquivo de decisões ausente.
`docs/ENGINEERING_STANDARDS.md` cumpre o papel dos documentos de padrões de código e
estratégia de testes que nunca foram entregues.

### C — MVP do PRD diverge do MVP do Roadmap (Home Staging incluído em um, excluído no outro)

**Decisão:** tornou-se irrelevante — não há mais fase de MVP (decisão de produto do
solicitante). Capabilities são implementadas por ordem de dependência técnica e valor,
registradas uma a uma em `docs/CAPABILITY_REGISTRY.md` com status real (`planned` /
`in_progress` / `shipped`), nunca agrupadas em um rótulo "MVP" que pudesse divergir entre
documentos.

### D — Vision Layer "nunca modifica" contradiz agentes que corrigem (Lighting, Perspective,
Reflection)

O documento de AI Architecture afirma que a Vision Layer apenas entende, nunca modifica. Mas
as especificações de agentes (AI Lighting, AI Perspective, AI Reflection Cleaner) descrevem
ações de correção/remoção — comportamento de Production Layer — e o pipeline os posicionava
tanto no estágio de entendimento quanto no de melhoria, com nomes inconsistentes entre
estágios ("Reflection AI" vs. "Reflection Cleaner").

**Decisão — padrão Analyze/Act:** todo agente com essa dualidade é modelado como **duas
capabilities distintas no Capability Registry**, compartilhando o mesmo modelo/insight
subjacente mas com contratos e camadas separados:

* `<nome>.analyze` — Vision Layer, somente leitura, produz achados para o Property Knowledge
  Graph.
* `<nome>.act` — Production Layer, aplica a correção, sempre reversível.

Aplicado inicialmente a `lighting`, `perspective` e `reflection`. Ver
`docs/CAPABILITY_REGISTRY.md`.

### E — "Export Layer" aparece no diagrama de camadas de IA mas não tem agente definido

**Decisão:** Export não é uma camada de capabilities do PIE™. É responsabilidade do
`Export Manager`, dentro do Rendering Engine. Removido da taxonomia de agentes. Ver
`docs/00-ARCHITECTURE.md`, seção 5.1.

### F — Meta de "processamento < 5 minutos" (PRD) conflita com "render Standard até 2× a
duração do vídeo" (Rendering Engine)

**Decisão:** a meta de tempo do produto passa a ser expressa com baseline explícita:

* Hardware de referência: CPU 8 núcleos, 16 GB RAM, GPU classe RTX 3060 ou equivalente.
* "Vídeo comum": até 3 minutos de duração bruta.
* A meta de **< 5 minutos** aplica-se ao tempo até a **primeira prévia navegável** (Preview
  mode, baixa resolução), não ao render final de produção, que segue a meta relativa (até 2×
  a duração) rodando em segundo plano após a prévia estar disponível.

Isso resolve o conflito sem contradizer nenhum dos dois documentos originais: a percepção de
velocidade (UX) e o tempo de render final (engenharia) passam a ser métricas distintas e
declaradas como tal.

### G — Stack de IA local ambíguo (FastAPI no Master Index vs. Electron/Node na Desktop
Architecture)

**Decisão:** ver `docs/00-ARCHITECTURE.md`, seção 10. ONNX Runtime via `onnxruntime-node` no
processo Electron/Node local; FastAPI reservado a Cloud AI, fora do caminho crítico offline.

## Consequências

* Toda nova capability deve ser registrada em `docs/CAPABILITY_REGISTRY.md` seguindo o padrão
  Analyze/Act quando aplicável.
* Mudanças estruturais relevantes futuras devem gerar um novo ADR neste diretório
  (`000N-titulo.md`), nunca uma edição silenciosa de `00-ARCHITECTURE.md`.
