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

Alvo desta fase (núcleo de produção completo do Desktop):

* Domain Layer + persistência local.
* Event Bus + Dependency Injection.
* PIE™ (orquestrador + Capability Registry).
* Vision pipeline (Intake, Scene, Room, Object — com modelo placeholder plugável).
* Duas capabilities de produção completas de ponta a ponta: Lighting e Color.
* Rendering Engine (modo Standard, fallback CPU).
* Export Manager (MP4/H.264).
* UI: Import, Timeline, Player, Preview, comparação Antes/Depois.

**Concluído até aqui** (ver `docs/CAPABILITY_REGISTRY.md` para status vivo, capability a
capability):

* Domain Layer (`Project` com metadados reais de vídeo, `Scene`, `DetectedObject`,
  `Confidence`) + Repository Pattern.
* Banco local SQLite (`@digify/database`) com runner de migrations versionado
  (`schema_migrations`), nunca armazena vídeo.
* PIE™ completo (`@digify/pie`): Capability Registry, Event Bus, orquestrador com gate de
  confidence.
* Capability `intake` — hash SHA-256 + metadados **reais** de vídeo via FFprobe (não
  placeholder): duração, resolução, fps, codec, áudio.
* Capability `scene.detect` — segmentação **real** de cenas via filtro de scene-change do
  FFmpeg (determinístico).
* Capability `lighting.analyze` — mede luminância real (FFmpeg `signalstats`), classifica
  subexposto/normal/superexposto.
* Capabilities `lighting.act` e `color.act` — decidem correção de brilho e color grading
  (os 8 perfis do catálogo original: Warm, Minimal, Luxury, Modern, Industrial, Beach,
  Scandinavian, Corporate) como filtros FFmpeg prontos para execução. Decidem, não executam
  ("A IA decide. O Rendering Engine executa.").
* **Rendering Engine** real (`RenderingEngine`) — executa a cadeia de filtros decidida via
  FFmpeg, produzindo um arquivo de vídeo novo (nunca sobrescreve o original — reversível por
  construção).
* Capability `room.recognize` — **primeiro modelo de IA treinado do zero na plataforma**
  (MobileNetV2 pré-treinado + classificador treinado por nós, 96,3% de acurácia em holdout
  real). Ver `docs/ml/ROOM_CLASSIFIER.md` para dataset, metodologia e — importante —
  **status de protótipo** (dataset de treino sem licença comercial clara).
* Capability `object.detect` — YOLOX-Nano (Apache 2.0), zero-shot em COCO, sem treino próprio
  (diferente de `room.recognize`, que precisou treinar porque não existe detector
  pré-treinado de "tipo de cômodo"). Ver `docs/ml/OBJECT_DETECTION.md`. Revelou e corrigiu um
  bug real no domínio: `DetectedObject.removable` estava definido como "tudo que não é
  `structural`", o que teria marcado sofás/geladeiras como removíveis.
* Capability `property.score` — nota 0–100 determinística combinando apenas sinais já
  medidos de verdade (exposição de `lighting.analyze`, bagunça de `object.detect`) — nunca
  inventa sinais sem medição real por trás (composição/estabilidade ficam `planned`).
* Capability `quality.sharpen` — realce de nitidez real via filtro `unsharp` do FFmpeg.
  Real-ESRGAN foi avaliado e adiado para a futura camada Cloud/GPU — ver `docs/ml/QUALITY.md`.
* Capability `home_staging.act` — combina detecção real (`object.detect`) com **inpainting
  generativo real** via LaMa (Apache 2.0): checkpoint TorchScript baixado do GitHub Releases
  (`Sanster/models`, não Hugging Face/Google Drive como os demais candidatos pesquisados),
  convertido para ONNX (`torch.jit.load` → `TS2EPConverter` → exportador dynamo, contornando
  um bug real do ONNX Runtime nos nós DFT com `graphOptimizationLevel: 'disabled'`) e verificado
  numericamente contra o TorchScript original. `RenderingEngine` ganhou suporte a overlay de
  imagem estática com janela de tempo (`enable='between(t,...)'`) pra compor o patch gerado
  sobre o vídeo. Cai no fallback clássico `delogo` quando o modelo (~196MB, não versionado no
  git) não está disponível localmente. Confidence fixo em 75 ("confirm") — nunca auto-aplica.
  Ver `docs/ml/HOME_STAGING.md` e `tools/inpainting/README.md`.
* **Player de vídeo real** — esquema customizado `digify-media://` (`apps/desktop/src/shared/media.ts`,
  registrado em `main/index.ts` via `protocol.registerSchemesAsPrivileged` + `protocol.handle`)
  permite o `<video>` do renderer reproduzir arquivos locais sem o renderer nunca tocar em
  `fs` diretamente (Least Privilege). Usado tanto para o vídeo original quanto para a prévia
  renderizada.
* **Export Manager real** (`ExportVideoUseCase`) — o usuário escolhe o destino via
  `dialog.showSaveDialog` nativo. Sem preset, o vídeo já renderizado (MP4/H.264, produzido
  pelo `RenderingEngine`) é copiado de verdade para lá; com um preset de rede social
  (`exportPresets.ts` — Instagram Feed/Reels/Stories, TikTok, YouTube/Shorts, Facebook Feed,
  dimensões e bitrates reais publicados por cada rede), gera de verdade a variante
  redimensionada via FFmpeg (`renderExportPreset.ts` — preenche o quadro alvo cobrindo e
  recortando o excesso, sem distorcer). Nunca sobrescreve o original nem o render interno.
  Projeto transiciona para status `exported`.
* Capabilities `perspective.analyze` + `perspective.act` — detecção real de inclinação de
  horizonte via Sobel + Transformada de Hough (geometria clássica determinística, não IA) e
  correção via rotação + recorte pela maior área sem cantos pretos + reescala. Verificado com
  vídeos sintéticos de ângulo conhecido gerados via FFmpeg (0°, 10°, -20° recuperados com
  exatidão) e a fórmula de recorte conferida contra um resultado geométrico conhecido
  (quadrado 45° → lado/√2). Ver `docs/vision/PERSPECTIVE.md` — só horizonte por enquanto,
  linhas verticais/distorção de lente ficam para depois.
* App Desktop Electron real (main/preload/renderer) com fluxo **Import → Intake → Scene
  Detect → Room Recognize → Object Detect → Property Score → persistência → Timeline (com
  ambiente real reconhecido) → Property Score exibido com sugestões → assistir o vídeo
  original → Aplicar melhorias (Lighting + Color + Nitidez opcional + Home Staging opcional +
  Nivelamento de horizonte opcional) → assistir a prévia renderizada → Exportar vídeo final
  (formato original ou preset de rede social) para onde o usuário escolher** funcionando de
  ponta a ponta, verificado com lançamento real
  via `xvfb-run` + Playwright/`_electron` controlando a janela de verdade e clicando os
  botões reais da UI (não apenas build, nem chamadas diretas de API pulando a interface).

Bugs de bundling só visíveis em execução real foram encontrados e corrigidos nestas etapas
(registrados no changelog dos commits e em `docs/ENGINEERING_STANDARDS.md`, não repetidos
aqui para evitar duplicação) — incluindo um novo relacionado ao Player: `pathToFileURL` do
Node não existe no `require("url")` polyfillado do preload sandboxado do Electron, só no
processo main com Node completo.

**Ainda não implementado nesta fase**: Reflection (analyze+act) — pesquisa exaustiva feita
(MirrorNet, GDNet, 3DRef, ADE20K/CSAILVision, ONNX Model Zoo, Objects365), sem sinal real
disponível: todo modelo com a classe "espelho/vidro" certa hospeda pesos fora do allowlist de
rede deste ambiente, e diferente do Home Staging não existe um fallback clássico honesto (uma
heurística de "brilho = reflexo" seria só ruído, não uma versão limitada da capability — ver
`docs/vision/REFLECTION.md`). Também faltam: linhas verticais/distorção de lente dentro de
Perspective. Os 8 perfis de Color do catálogo original e o inpainting generativo real do Home
Staging (LaMa) já estão implementados. Marketplace, Plugin SDK, Cloud (sync,
colaboração, render distribuído), Mobile, Digital Twin seguem fora do escopo — arquitetura já
preparada para recebê-los sem redesenho (Plugin First / Capability Architecture): cada um
entra como uma nova capability registrada no PIE™, sem alterar o núcleo.

## 12. Referências

* Princípios de produto, UX, jornadas, monetização, análise competitiva, roadmap de longo
  prazo e innovation lab permanecem válidos como estão em `docs/reference/original-docs/`.
* Decisões que resolvem inconsistências: `docs/adr/0001-architecture-foundation-decisions.md`.
* Padrões de engenharia: `docs/ENGINEERING_STANDARDS.md`.
* Catálogo de capabilities: `docs/CAPABILITY_REGISTRY.md`.
