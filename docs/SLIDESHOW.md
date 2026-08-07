# Criar vídeo a partir de fotos e PDF

**Status: shipped.** Fotos e/ou anúncios em PDF entram, um vídeo pronto pra
publicar sai — com movimento de câmera simulado, transições e legenda.

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
| Áudio (MP3, M4A, AAC, WAV, OGG) | Trilha de fundo, com fade de saída |

A ordem da lista na tela é a ordem do vídeo, e é reordenável.

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
* **Electron real** (`xvfb-run electron`): `@napi-rs/canvas` (nativo) e
  `pdfjs-dist` (ESM) carregam no processo main, o PDF rasteriza
  (763x1080, texto correto) e o vídeo é montado. Isto importa porque o
  `import()` dinâmico de ESM dentro do bundle do Electron é exatamente o
  tipo de coisa que passa no teste unitário e quebra no app empacotado.

## Limitações honestas

* **PDF escaneado não tem texto** — é imagem. A página vira slide
  normalmente, mas não há legenda automática pra extrair.
* **Sem detecção de rosto ou de assunto**: o Ken Burns sempre parte do
  centro. Uma foto com o assunto muito na borda pode ter enquadramento
  infeliz.
* **A ordem é a que o usuário der.** O app não reordena por cômodo nem
  escolhe a melhor foto de capa — `room.recognize` existe e poderia fazer
  isso, mas não está ligado aqui.
* **Uma trilha só, sem corte no ritmo da música.** O fade de saída é fixo em
  2s.
