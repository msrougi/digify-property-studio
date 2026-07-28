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
| `intake` | Intake | Hash SHA-256 + metadados reais de vídeo via FFprobe (duração, resolução, fps, codec, áudio). **Nota:** HDR/orientação/bitrate ainda não extraídos. | shipped |

## Vision (somente leitura — nunca modifica mídia)

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `scene.detect` | Vision | Segmentação real em cenas via filtro de scene-change do FFmpeg (determinístico, não probabilístico). | shipped |
| `room.recognize` | Vision | **Primeira capability com modelo de IA treinado de verdade** — MobileNetV2 (ImageNet) + classificador treinado por nós, 96,3% de acurácia em holdout real. Reconhece `bedroom`/`bathroom`/`kitchen`. Ver `docs/ml/ROOM_CLASSIFIER.md` — **protótipo, dataset de treino sem licença comercial clara, não usar em produção sem resolver isso**. Demais ~17 tipos de ambiente do catálogo original sem dado de treino ainda. | shipped (protótipo) |
| `object.detect` | Vision | YOLOX-Nano (Apache 2.0), zero-shot em COCO (80 classes), sem tracking (roda por frame-cena, não por vídeo inteiro). Mapeia classes COCO para `structural`/`decorative`/`temporary`/`personal`/`luxury`. Ver `docs/ml/OBJECT_DETECTION.md`. | shipped |
| `property.score` | Vision | Nota 0–100 determinística a partir de sinais já medidos (`lighting.analyze` + contagem de objetos temporários de `object.detect`) — sem estabilidade/composição ainda, por não terem sinal real por trás. | shipped |
| `lighting.analyze` | Vision | Mede luminância média real via FFmpeg `signalstats`, classifica subexposto/normal/superexposto. Determinístico, não é modelo de IA — confidence sempre 100. Sombras/temperatura de cor ainda não medidas. | shipped |
| `perspective.analyze` | Vision | Detecta inclinação real do horizonte, de linhas verticais (quinas de parede, batentes de porta) via Sobel + Transformada de Hough, E distorção de lente grande angular (barril) via busca real de `k1` sobre o filtro `lenscorrection` do FFmpeg (geometria clássica, não IA), verificado contra vídeos sintéticos com ângulo/distorção conhecidos. Ver `docs/vision/PERSPECTIVE.md`. | shipped (horizonte + verticais + lente) |
| `reflection.analyze` | Vision | Detecta superfícies reflexivas e objetos indesejados refletidos (equipe/tripé). Pesquisa em duas rodadas (MirrorNet, GDNet, 3DRef, ADE20K/CSAILVision, ONNX Model Zoo, Objects365, XReflection, SAM2-UNet) — o único candidato com pesos hospedados de forma acessível (`PINTO0309/reflection-removal`, GitHub Releases) foi baixado e testado empiricamente contra ground truth sintético, e reprovou (piora a imagem em vez de melhorar). Ver `docs/vision/REFLECTION.md`. | planned (testado, sem sinal real utilizável) |

## Production (modifica mídia — sempre reversível)

| ID | Camada | Descrição | Status |
|---|---|---|---|
| `lighting.act` | Production | Decide a correção de brilho a partir de `lighting.analyze` (não executa — quem executa é o Rendering Engine). Nunca altera a atmosfera original além do necessário. | shipped |
| `color.act` | Production | Decide o filtro de color grading para os 8 perfis do catálogo original (Warm, Minimal, Luxury, Modern, Industrial, Beach, Scandinavian, Corporate). Os originais não especificam parâmetros exatos por perfil — cada filtro é uma tradução nossa da intenção estética em parâmetros reais de FFmpeg (`eq`/`colorbalance`). | shipped (8 de 8 perfis) |
| `quality.sharpen` | Production | Realce de nitidez conservador via filtro `unsharp` do FFmpeg (processamento clássico, não é super-resolução por IA). Não estava no catálogo original — adicionado como resultado real e viável no lugar de Real-ESRGAN. Ver `docs/ml/QUALITY.md`. | shipped |
| `perspective.act` | Production | Corrige distorção de lente (`lenscorrection`, sem recorte necessário), nivela o horizonte (rotação + recorte pela maior área sem cantos pretos + reescala) e/ou endireita linhas verticais (cisalhamento via filtro `perspective` do FFmpeg + recorte seguro + reescala) — as três independentes e combinadas na mesma cadeia, lente sempre primeiro (`docs/vision/PERSPECTIVE.md`). Cada correção clampada, confidence 75 ("confirm") — nunca auto-aplica. | shipped (horizonte + verticais + lente) |
| `reflection.act` | Production | Remove objetos refletidos indesejados com base em `reflection.analyze`. Bloqueado pela mesma falta de sinal real — ver `docs/vision/REFLECTION.md`. | planned (bloqueado por `reflection.analyze`) |
| `home_staging.act` | Production | Detecção real (`object.detect`) + inpainting generativo real (LaMa, Apache 2.0 — checkpoint baixado do GitHub Releases, convertido pra ONNX, verificado numericamente contra o TorchScript original) via `onnxruntime-node`. Overlay de imagem gerada composto sobre o vídeo só na janela de tempo da cena. Cai no fallback clássico `delogo` quando o modelo (~196MB, não versionado no git) não está disponível localmente. Confidence fixo em 75 ("confirm") — nunca auto-aplica. Ver `docs/ml/HOME_STAGING.md` e `tools/inpainting/README.md`. | shipped (inpainting real, com fallback) |
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

* **Rendering Engine** (`apps/desktop/src/infrastructure/render/RenderingEngine.ts`) —
  executa via FFmpeg real a cadeia de filtros já decidida pelas capabilities de Production
  (`lighting.act`, `color.act`, ...). "A IA decide, o Rendering Engine executa" — nunca o
  contrário. Não é uma capability porque não decide nada, apenas processa.
* **Export** — responsabilidade do `Export Manager`, dentro do Rendering Engine (ADR-0001,
  item E), não do PIE™. Ainda não implementado.

## Regras de todo capability

* Todo `*.act` deve ser reversível (o Domain Layer versiona o estado anterior).
* Todo `*.analyze` é somente leitura e escreve exclusivamente no Property Knowledge Graph —
  nunca em arquivos de mídia.
* Toda saída carrega `confidence` (0–100) seguindo os limiares definidos em
  `docs/00-ARCHITECTURE.md`, seção 6.
* Nenhuma capability chama outra diretamente — apenas via PIE™.
