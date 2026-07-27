# Documentos Originais (Referência Histórica)

Estes 23 documentos + Master Index foram entregues como visão inicial de produto e arquitetura
do Digify Property Studio. Eles permanecem aqui como **referência histórica e fonte de inspiração**,
mas **não são mais a fonte de verdade operacional**.

## Por que foram substituídos

Durante a leitura completa, foram identificadas inconsistências entre estes documentos
(numeração do Master Index não correspondente aos arquivos reais, definição de MVP divergente
entre PRD e Roadmap, contradições na filosofia da Vision Layer, lacunas de documentos
referenciados mas ausentes). O registro completo dessas inconsistências e as decisões que as
resolvem estão em `docs/adr/0001-architecture-foundation-decisions.md`.

## Fonte de verdade atual

A partir desta versão, a documentação oficial e vinculante do projeto é:

- `docs/00-ARCHITECTURE.md` — visão geral, princípios, arquitetura em camadas, PIE™, pipeline.
- `docs/CAPABILITY_REGISTRY.md` — catálogo canônico de capabilities/agentes e seus contratos.
- `docs/ENGINEERING_STANDARDS.md` — padrões de código, testes e revisão.
- `docs/adr/` — histórico de decisões arquiteturais (inclui a resolução das inconsistências
  destes documentos originais).

Sempre que houver conflito entre um documento original nesta pasta e a documentação em
`docs/`, **a documentação em `docs/` prevalece**.
