# Capability Registry

Catálogo canônico de capabilities (agentes de IA) orquestradas pelo PIE™. Substitui a lista
informal do documento original `08 - AI Agents.md` — mesmo conteúdo funcional, reorganizado
para corrigir a inconsistência da Vision Layer (ADR-0001, item D) e remover a "Export Layer"
sem agente (ADR-0001, item E).

Status possíveis: `shipped` (implementado e testado), `in_progress` (nesta iteração),
`planned` (arquitetado, aguardando implementação).

## Orquestração

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `pie.orchestrator` | Orchestration | Núcleo do PIE™: planejamento, priorização, resolução de conflitos, Capability Registry, validação. Nunca processa mídia. | shipped |

## Intake

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `intake` | Intake | Hash SHA-256 + metadados de arquivo (tamanho, nome). **Nota:** extração de codec/fps/HDR/resolução/duração via ffprobe ainda não implementada — placeholder documentado em `IntakeCapability.ts`. | shipped |

## Vision (somente leitura — nunca modifica mídia)

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `scene.detect` | Vision | Segmentação em cenas: cortes naturais, mudança de ambiente, cenas repetidas. | planned |
| `room.recognize` | Vision | Classifica o ambiente (sala, cozinha, quarto, ...) e relevância comercial. | planned |
| `object.detect` | Vision | Detecção + tracking de objetos com máscara, bounding box, categoria, confidence. | planned |
| `property.score` | Vision | Nota 0–100 de potencial comercial (iluminação, estabilidade, composição, organização). | planned |
| `lighting.analyze` | Vision | Analisa luz natural/artificial, sombras, temperatura de cor. Produz achados para o PKG™. | planned |
| `perspective.analyze` | Vision | Detecta horizonte, linhas verticais, distorção de lente. | planned |
| `reflection.analyze` | Vision | Detecta superfícies reflexivas e objetos indesejados refletidos (equipe/tripé). | planned |

## Production (modifica mídia — sempre reversível)

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `lighting.act` | Production | Aplica correção de iluminação com base em `lighting.analyze`. Nunca altera a atmosfera original. | planned |
| `color.act` | Production | Color grading por perfil (Luxury, Minimal, Modern, ...). | planned |
| `perspective.act` | Production | Corrige horizonte/distorção com base em `perspective.analyze`. | planned |
| `reflection.act` | Production | Remove objetos refletidos indesejados com base em `reflection.analyze`. | planned |
| `home_staging.act` | Production | Remove itens temporários (nunca estrutura/mobiliário fixo). Toda remoção é reversível. | planned |
| `decorator.act` | Production | Adiciona elementos decorativos discretos opcionais. | planned |
| `audio.engineer` | Production | Remove ruído/vento/eco, normaliza volume. | planned |

## Marketing

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `story.director` | Marketing | Define abertura, encerramento, ordem dos ambientes e ritmo. Nunca altera imagem. | planned |
| `storytelling` | Marketing | Sequência emocional e progressão narrativa. **Nota:** sobreposição de responsabilidade com `story.director` identificada na leitura dos docs originais — precisa de ADR próprio antes de implementar ambos; candidato a fusão em uma única capability. | planned |
| `buyer_vision` | Marketing | Gera narrativas por perfil de comprador (Família, Executivo, Investidor, ...). O vídeo muda; o imóvel não. | planned |
| `thumbnail.designer` | Marketing | Ranking e seleção de melhores frames por plataforma. | planned |
| `copywriter` | Marketing | Título, descrição, bullet points, chamada comercial. | planned |
| `seo` | Marketing | Meta title/description, keywords, slug, alt text, hashtags. | planned |
| `social_media` | Marketing | Adaptação por plataforma (Instagram, Facebook, TikTok, ...). | planned |

## Learning

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `learning` | Learning | Aprende preferências individuais do usuário. Nunca muda comportamento abruptamente. | planned |
| `market_intelligence` | Learning | Aprendizado agregado (retenção, cliques, contatos). Nunca usa dados identificáveis. | planned |
| `analytics` | Learning | Relatórios de tempo economizado, objetos removidos, performance. | planned |

## Quality (gate final — bloqueia export)

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `quality.control` | Quality | Valida naturalidade, continuidade, artefatos, consistência antes de liberar export. | planned |
| `compliance` | Quality | Bloqueia alterações enganosas, manipulação estrutural, ocultação de defeitos. | planned |

## Fora da taxonomia de capabilities (não são agentes do PIE™)

* **Export** — responsabilidade do `Export Manager`, dentro do Rendering Engine (ADR-0001,
  item E), não do PIE™.

## Regras de todo capability

* Todo `*.act` deve ser reversível (o Domain Layer versiona o estado anterior).
* Todo `*.analyze` é somente leitura e escreve exclusivamente no Property Knowledge Graph —
  nunca em arquivos de mídia.
* Toda saída carrega `confidence` (0–100) seguindo os limiares definidos em
  `docs/00-ARCHITECTURE.md`, seção 6.
* Nenhuma capability chama outra diretamente — apenas via PIE™.
