# Criar vídeo a partir de fotos, PDF e site

**Status: shipped.** Fotos, anúncios em PDF e a própria página do imóvel
entram; um vídeo pronto pra publicar sai — com movimento de câmera simulado,
transições e legenda.

## Por que este caminho é diferente de tudo que veio antes

Toda a dor documentada em `docs/ml/HOME_STAGING.md` vem de um fato: lá a IA
**adivinha o que existe atrás de um objeto**. Errar a adivinhação significa
coifa borrada e lustre apagado.

Aqui nada é adivinhado. É composição determinística: pega esta imagem,
aplica este movimento, esta transição, este texto. As mesmas entradas com os
mesmos parâmetros produzem sempre o mesmo vídeo, e nenhum pixel do material
do cliente é inventado.

Consequências práticas:

* **Não existe "deformar"** — o risco que fez o usuário quase desistir
  simplesmente não se aplica.
* **É rápido**: segundos, contra os ~15 min da remoção de objetos.
* **Dá pra prometer sem ressalva**, que é raro neste repositório.

## O que entra

| Entrada | Como é tratada |
|---------|----------------|
| Fotos (JPG, PNG, WEBP, BMP, TIFF, HEIC) | Um slide cada |
| PDF | **Uma página = um slide**, rasterizada na altura da saída |
| Site (http/https) | Página capturada e **fatiada** na proporção do vídeo |
| Áudio (MP3, M4A, AAC, WAV, OGG) | Trilha de fundo, com fade de saída |

Tudo numa lista só, porque pro usuário é uma sequência só: a foto da sala, a
página do anúncio e o PDF convivem e são reordenáveis do mesmo jeito.


## PDF é material de primeira classe, não anexo

`rasterizePdf.ts` usa `pdfjs-dist` (Apache 2.0, o leitor do Firefox) com
`@napi-rs/canvas` como superfície de desenho. **Nenhuma ferramenta externa**:
não existe `pdftoppm`/`ghostscript` no ambiente, e depender de binário
instalado na máquina do usuário quebraria a instalação em um clique.

Dois detalhes que não são opcionais:

* **`standardFontDataUrl` é obrigatório.** Fontes padrão (Helvetica, Times)
  não vêm embutidas no PDF — o leitor precisa fornecê-las. Sem apontar essa
  pasta, o pdf.js desenha a página **sem o texto e sem erro nenhum**: sai um
  PNG silenciosamente errado.
* **Rasteriza na altura da saída**, não numa altura fixa. A página é vetor,
  então sai nítida no tamanho final em vez de ser miniatura ampliada.

O texto vem de brinde e não é detalhe: é o material do anúncio (metragem,
quartos, preço) que vira legenda **sem ninguém redigitar nada**. Ele é
truncado em 90 caracteres na fronteira de palavra — parágrafo inteiro
viraria parede de texto sobre a foto, e cortar no meio de um número é pior
que cortar a frase.

## Site: capturado pelo Chromium que já vem no Electron

`ElectronWebPageCapturer` carrega a URL numa janela invisível e fotografa a
página. Nenhuma dependência nova — o navegador já está no app.

### Isolamento

A URL é digitada pelo usuário, então é **conteúdo não confiável rodando
dentro do app**. A janela usa `sandbox`, sem integração com Node, sem preload,
com `webSecurity`, e `setWindowOpenHandler` nega qualquer popup.

Só `http`/`https` passam (`isSupportedWebUrl`). Não é formalidade:
`file://` daria à página acesso de leitura ao disco do usuário e
`javascript:` executaria código. Como o endereço vem digitado, esse filtro é
a fronteira de confiança — e tem teste dedicado pra cada esquema recusado.

Verificado no Electron real: a página capturada não enxerga `require`,
`process` nem `window.digify`.

### Por que fatiar em vez de espremer

Um anúncio tem ~5.000px de altura. Espremer isso num quadro 16:9 deixa o
texto ilegível, o que anula o motivo de pôr o site no vídeo. A captura
inteira é cortada em fatias **na proporção do vídeo**, na ordem de leitura,
com 6% de sobreposição pra não partir frase ao meio. Teto de 3 fatias por
site: página longa não pode virar um vídeo de 20 slides.

A janela virtual tem 1280px de largura de propósito — é largura de desktop,
então o site entrega o layout "de computador". Em 400px viria o layout de
celular, estreito e com tudo empilhado.

### Preparar a página antes de fotografar

Carregar a URL e fotografar direto **não funciona** para site de imóvel. Duas
preparações, medidas numa reprodução do comportamento real:

**1. Fechar o aviso de cookie (LGPD).** Praticamente todo site brasileiro
abre com essa tarja. Sem fechá-la, o vídeo do corretor mostra "Aceitar
cookies" cobrindo o imóvel — e, pior, muitos desses avisos deixam a página
com `overflow: hidden`, o que impediria rolar pra carregar as fotos.

Duas passadas, da mais segura pra menos: seletores exatos de plataformas
conhecidas (OneTrust, Cookiebot, Osano…), depois botões com texto de aceite
**dentro de um container que se identifica como cookie/consent/lgpd**. Essa
restrição ao container é o que impede clicar num "Aceitar" de proposta ou
contrato no meio do anúncio. Só então, o que sobrou cobrindo a tela é
escondido — e de forma conservadora: apenas elemento fixo que cobre mais de
metade da tela numa camada alta, porque um cabeçalho fino com o preço também
é fixo e não pode sumir.

**2. Rolar a página inteira.** Isto não é polimento. Medido: numa página com
galeria `loading="lazy"`, sem rolar **só 3 de 8 fotos tinham carregado**. O
vídeo sairia com retângulos cinza no lugar das fotos do imóvel — exatamente o
que se quer mostrar. A rolagem também dispara os blocos com animação de
entrada (`IntersectionObserver`), comuns em landing page de lançamento.

Depois de rolar, volta ao topo. E como a captura redimensiona a janela para a
altura total da página, no instante da foto **a página inteira está na
viewport**, o que revela qualquer bloco que ainda dependesse disso.

Medido no momento exato da captura: banner fechado, **8/8 fotos carregadas,
8/8 blocos revelados** (contra 1/8 e 3/8 ao abrir).

### Título vira legenda

Prioridade: `og:title` → `<title>` → primeiro `<h1>`. Só a **primeira** fatia
leva a legenda; repeti-la em todas viraria uma tarja fixa por vários
segundos.

### O bug que só a execução real pegou

A primeira versão chamava `session.clearStorageData()` no `finally`, por
higiene. Rodando no Electron de verdade: **essa promessa nunca resolve** numa
sessão em memória — nem cumpre, nem rejeita. Dentro de um `finally` com
`await`, toda captura de site congelaria o app para sempre. Um `.catch()` não
salvaria, porque a promessa simplesmente não assenta.

A correção foi remover, não contornar: a partição **não** leva o prefixo
`persist:`, então o Electron já mantém tudo em memória e não existe storage
em disco pra limpar. A chamada era, ao mesmo tempo, fatal e desnecessária.

## Legenda: por que ASS/libass e não `drawtext`

O FFmpeg embarcado (`ffmpeg-static`) **não traz o filtro `drawtext`** —
verificado, ele não existe nesta compilação. O que existe é `subtitles`, com
libass.

Não foi contorno com prejuízo: o libass rende melhor. Contorno, sombra,
quebra de linha e acentuação saem sem configuração extra.

O estilo é calculado a partir da **altura do vídeo**, não em pixels fixos: o
mesmo texto precisa ficar legível num 1920x1080 de feed e num 1080x1920 de
story. `buildAssSubtitles.ts` também escapa `{`, `}` e `\` — no ASS essas
chaves delimitam tags de override, então um preço escrito `{R$ 500}`
**sumiria da tela sem erro nenhum**.

## Som

A trilha entra com fade de 1s e sai com fade de 2s — música que começa e
corta a plena carga soa amadora, que é o oposto do objetivo.

### O bug que quase custou o vídeo do usuário

A primeira versão usava `-shortest` junto com a faixa de áudio. Medido: um
vídeo de 10,8s com uma música de 4s saía com **4 segundos**. O `-shortest`
corta pelo fluxo mais curto — e o mais curto era a música. O corretor
perderia dois terços do trabalho sem nenhuma mensagem de erro.

A correção é `-stream_loop -1` no áudio: a música se repete quantas vezes
precisar, e quem manda na duração final é o `-t` da saída. Faixa mais longa
que o vídeo continua sendo cortada normalmente.

Coberto por dois testes que medem o som de verdade, não só a presença da
faixa: um verifica que faixa curta não encurta o vídeo; o outro mede o
**volume real** (`volumedetect`) em duas janelas, confirmando que o miolo tem
som e que o último segundo, dentro do fade, tem pelo menos 5 dB a menos.

## Ken Burns sem tremor

O `zoompan` do FFmpeg calcula o recorte em passos inteiros de pixel. Numa
imagem do tamanho exato da saída o movimento sai aos trancos — artefato
conhecido do filtro.

`ZOOMPAN_SUPERSAMPLE = 2` amplia a imagem antes, dando subpixel de sobra.
É o ponto em que o tremor some sem estourar memória (cada quadro
intermediário de um 1080p vira 4K).

O sentido do zoom alterna entre slides: uma sequência inteira zoomando pro
mesmo lado cansa e denuncia que foi automático.

## Duração e transição

Uma transição consome tempo dos **dois** slides que ela liga — o segundo
começa a aparecer antes de o primeiro sair. Por isso:

```
duração total = Σ(duração dos slides) − transição × (nº de slides − 1)
```

Sem descontar isso, a duração pedida e a real divergem e a legenda
dessincroniza.

## Formatos

| Formato | Resolução | Onde |
|---------|-----------|------|
| `feed`  | 1920x1080 | Feed do Instagram, YouTube, site |
| `story` | 1080x1920 | Story, Reels, TikTok |
| `square`| 1080x1080 | Post quadrado |

Enquadramento por `increase` + `crop`: foto em pé numa saída deitada (e
vice-versa) preenche o quadro, sem tarja preta.

## Verificação feita

Tudo com arquivos reais gerados por FFmpeg e PDFs montados byte a byte (o
PDF de teste **não** é gerado pela mesma biblioteca que o lê — isso provaria
menos):

* `SlideshowRenderer.test.ts` — duração real bate com a fórmula acima;
  dimensões corretas; progresso vindo do próprio FFmpeg; **Ken Burns
  provado** (dois quadros de uma foto *parada* diferem em >10% dos pixels);
  **legenda provada** (fundo preto, zero pixels claros sem legenda, >200 com);
  recusa lista vazia.
* `rasterizePdf.test.ts` — PNG válido (confirmado por FFprobe), proporção A4
  preservada, texto extraído, múltiplas páginas viram slides distintos.
* `CreateSlideshowUseCase.test.ts` — mistura fotos e PDF na ordem pedida;
  formato vertical respeitado; legenda do PDF só aparece quando pedida
  (medido comparando pixels escuros na faixa inferior); recusa tipo não
  suportado e lista vazia.
* `WebPageCapturer.test.ts` — aceita http/https; recusa `file://`,
  `javascript:`, `data:`, caminho de arquivo e texto solto.
* `CreateSlideshowUseCase.test.ts` (site) — endereço tratado como fonte na
  mesma lista das fotos, ordem preservada, contagem de fatias correta, e
  erro claro quando não há capturador disponível.
* **Electron real** (`xvfb-run electron`): `@napi-rs/canvas` (nativo) e
  `pdfjs-dist` (ESM) carregam no processo main, o PDF rasteriza
  (763x1080, texto correto) e o vídeo é montado. Isto importa porque o
  `import()` dinâmico de ESM dentro do bundle do Electron é exatamente o
  tipo de coisa que passa no teste unitário e quebra no app empacotado.
* **Electron real (site)**: servidor HTTP local de 4.920px de altura —
  `og:title` tem prioridade sobre `<title>`, a captura sai 1280x4920, vira
  3 fatias 16:9, o vídeo é montado, a janela é destruída sem travar, e a
  página não enxerga `require`/`process`/`window.digify`.
* **Electron real (landing page de imóvel)**: página com aviso LGPD que trava
  a rolagem, galeria `loading="lazy"` e blocos com `IntersectionObserver`.
  Ao abrir: banner presente, rolagem travada, 3/8 fotos, 1/8 blocos. No
  momento da captura: banner fechado, rolagem liberada, **8/8 fotos e 8/8
  blocos**.

## Limitações honestas

* **PDF escaneado não tem texto** — é imagem. A página vira slide
  normalmente, mas não há legenda automática pra extrair.
* **Site exige internet** — é a única parte do app que não funciona offline.
* **A captura é a de um visitante anônimo**: sem login, sem cookie, sem
  histórico, como uma aba anônima. Para o caso de uso principal (site do
  próprio imóvel/lançamento) isso é irrelevante — o dono quer visita. Mas
  página atrás de **login** ou com **proteção antibot** (Cloudflare) sai como
  o estranho veria: a tela de entrar ou a verificação, não o imóvel. O muro
  de cookies, que é o caso comum, já é tratado (ver acima).
* **Carrossel mostra um slide só.** Galeria que troca foto por clique é
  fotografada no slide em que estiver. Rolar não ajuda — teria que clicar nas
  setas, o que não é feito.
* **Rolagem infinita é cortada em 12.000px.** Sem teto, uma página que
  carrega conteúdo pra sempre consumiria memória proporcional à altura.
* **Sem espera por animação de entrada.** São 1,2s de folga depois do
  carregamento; site com muita animação pode ser fotografado no meio dela.
* **Sem detecção de rosto ou de assunto**: o Ken Burns sempre parte do
  centro. Uma foto com o assunto muito na borda pode ter enquadramento
  infeliz.
* **A ordem é a que o usuário der.** O app não reordena por cômodo nem
  escolhe a melhor foto de capa — `room.recognize` existe e poderia fazer
  isso, mas não está ligado aqui.
* **Uma trilha só, sem corte no ritmo da música.** O fade de saída é fixo em
  2s.
