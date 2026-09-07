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
| Áudio (MP3, M4A, AAC, WAV, OGG) | Trilha de fundo, com fade de entrada e saída |
| Logo (PNG, JPG, WEBP) | Abertura/encerramento, marca d'água, ou os dois |

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

## Logo da marca

Três modos, escolhidos pelo usuário:

| Modo | O que faz |
|------|-----------|
| `intro` | Arte de abertura **e** encerramento, logo grande e centralizado |
| `watermark` | Logo discreto no canto inferior direito, o vídeo inteiro |
| `both` | Os dois (padrão quando há logo) |

A arte de abertura é gerada como **PNG comum** (`composeLogoCard.ts`) e entra
na lista como qualquer foto. Assim todo o caminho já testado — transição,
duração, codificação — vale pra ela sem tratamento especial. A mesma arte
abre e fecha: é a assinatura da marca, e repeti-la fecha o vídeo com quem o
assina.

Detalhes que não são cosméticos:

* **`staticFrame` desliga o Ken Burns** nas artes de logo. Elas já vêm no
  tamanho exato da saída; aproximar um logo só o deixaria borrado e cortado
  nas bordas.
* **`force_original_aspect_ratio=decrease`** em vez de esticar. Uma marca
  horizontal e uma quadrada dão o mesmo resultado proporcional — esticar o
  logo de um cliente seria pior que não ter logo.
* **`format=rgba` antes do `scale`** preserva a transparência do PNG. Sem
  isso, logo com fundo transparente ganha fundo preto ao ser redimensionado.
* **A marca d'água entra por último**, depois da legenda: ela representa a
  marca do corretor e não pode ficar atrás de texto.
* **Opacidade 0,85** porque acompanha o vídeo inteiro — a marca precisa ser
  lida sem competir com o imóvel.

### O bug de processo que valeu a lição

A primeira tentativa de implementar isso **não foi aplicada ao arquivo**: um
`cd` falhou no meio do script e o patch rodou no diretório errado, em
silêncio. O typecheck passou (as interfaces tinham entrado por outro
caminho), o render rodou sem erro, e nada aparecia no vídeo.

Só o teste que **contava pixels amarelos por região** revelou que o código
não existia. Vale o registro: typecheck verde e render sem exceção não
provam que uma funcionalidade visual existe — só medir o quadro prova.

Coberto por dois testes que medem pixel: a marca aparece no canto e dá
**zero fora dele**; a abertura e o encerramento têm logo grande no miolo e o
meio do vídeo tem zero.

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

## Trilhas: pasta do usuário, não biblioteca embutida

O app **não fornece música** — e isso é decisão, não lacuna. Redistribuir
faixas exigiria licenciamento, e o risco real do corretor não é achar
música: é publicar com a música errada.

> Música comercial em post de Instagram, YouTube ou TikTok costuma ser
> **silenciada ou bloqueada** automaticamente pelo Content ID. Um vídeo bem
> montado com a trilha errada vira um vídeo mudo no feed do cliente.

O caminho escolhido com o dono do produto foi a **YouTube Audio Library**
(faixas livres para uso comercial). O app torna isso prático em vez de
apenas possível:

* **Botão que abre a biblioteca** no navegador. A URL é uma **constante no
  processo main** — `shell.openExternal` com endereço vindo do renderer
  seria um vetor pra abrir qualquer coisa na máquina do usuário.

  A primeira versão tinha `studio.youtube.com/channel/UC/music` chumbado:
  um **ID de canal inventado** (ID real tem 24 caracteres), então o botão
  não abriria nada. Corrigido pra `studio.youtube.com/music`, sem o
  segmento — o Studio resolve pro canal de quem está logado. Como o ambiente
  de desenvolvimento não tem saída pra internet, **o redirecionamento não
  pôde ser confirmado aqui**; por isso a tela também mostra o endereço em
  texto, pra que um redirecionamento errado não vire beco sem saída.
* **Pasta de trilhas**: o usuário baixa as faixas uma vez, aponta a pasta, e
  escolher a música vira um clique numa lista em vez de navegar o diálogo de
  arquivos a cada vídeo.
* **A tela explica o fluxo** enquanto não há pasta escolhida. Duas dúvidas
  reais do usuário motivaram o texto: *"tenho que fazer login?"* (sim, é
  exigência do Google) e *"não baixo na hora?"* (baixa — e nem precisa de
  pasta).

### Dois caminhos, não um

A pasta **nunca foi obrigatória**. O botão "Adicionar música" (seletor de
arquivo comum) sempre atendeu quem baixa a faixa na hora e usa direto. A
pasta é atalho pra quem reusa as mesmas faixas: vira um clique por vídeo em
vez de navegar o diálogo.

Isso expôs um bug de coerência: com a pasta configurada, uma faixa escolhida
pelo seletor **não está na lista**, então o `select` não achava o valor e
exibia "Sem música" — **a tela mentia enquanto o vídeo saía com trilha**.
Corrigido acrescentando a faixa de fora como opção própria, marcada "(fora
da pasta)".

### O que o app deliberadamente NÃO faz

Baixar as faixas sozinho. Automatizar isso exigiria dirigir uma sessão
logada do Google — contra os termos do YouTube, dependente de guardar
credencial do usuário, e quebradiço a cada mudança de página. O download
fica no navegador, onde é do usuário e é legítimo.
* **Só o primeiro nível da pasta** é listado: subpasta costuma ser
  organização do usuário e varrer tudo devolveria lista longa demais.

### Preferências sobrevivem à sessão

`preferencias.json` fica **fora** da lista de `sessionData.ts`. Projetos e
vídeos são apagados a cada abertura porque o app é ferramenta de passagem,
mas logo, modo do logo e pasta de trilhas são configuração de quem usa —
reapontar o próprio logo a cada vídeo seria atrito puro.

Duas proteções que a leitura faz, cobertas por teste:

* **Caminho que não existe mais é esquecido.** Logo movido, pendrive
  removido, pasta renomeada — devolver o caminho velho faria o render falhar
  lá na frente com "arquivo não encontrado". Esquecer aqui faz a tela
  simplesmente pedir de novo. (`logoMode` sobrevive: é preferência pura, não
  aponta pra disco.)
* **Arquivo corrompido não impede o app de abrir** — começa limpo.

## Busca de trilha embutida (Openverse)

A limitação anterior era real: o app abria a biblioteca e parava ali. Baixar,
achar a pasta, arrastar o arquivo e conferir a licença ficava tudo com o
usuário — e a licença, na prática, ninguém conferia.

A **Openverse** (projeto oficial do Creative Commons) resolve isso porque tem
o que a YouTube Audio Library não tem: **uma API pública, sem chave e sem
login**, com filtro de licença na própria consulta. Agora dá pra buscar,
ouvir e baixar sem sair do app.

O que ela perde: **curadoria**. A Openverse agrega Jamendo, ccMixter,
Freesound e Wikimedia, então gravação de campo e sample solto vêm misturados
com música — enquanto a biblioteca do YouTube é curada pra quem faz vídeo.
Por isso o botão da YouTube Audio Library **continua na tela**: quem quer
garimpar tem a busca, quem quer o acervo curado tem o link.

### O filtro de licença é o coração disto

`COMMERCIAL_SAFE_LICENSES = ["cc0", "by"]`. A lista é curta de propósito, e
cada exclusão tem motivo:

| Licença | Por que fica de fora |
| --- | --- |
| `by-nc` | Proíbe uso comercial — e corretor vendendo imóvel **é** uso comercial. |
| `by-nd` | Proíbe obra derivada, e vídeo **com** a música por cima é derivada. |
| `by-sa` | Obriga a obra derivada à mesma licença: contaminaria o vídeo do cliente. |

A checagem é por **igualdade exata, nunca `includes`**. `by-nc` contém `by` —
um filtro por substring deixaria passar justamente a licença que proíbe o
único uso que o app tem. O teste cobre as quatro licenças perigosas uma a uma.

O filtro roda **duas vezes**: vai como parâmetro na consulta *e* é reaplicado
em cada item da resposta. Confiar só no parâmetro seria confiar que um
servidor remoto respeita o filtro que pedimos.

### Crédito gerado, não lembrado

Faixa `CC BY` **exige** citar autor, título, licença e origem. Deixar isso
com o usuário é garantir que ele esqueça — e publicar sem crédito anula a
razão de ter escolhido música livre.

Então o crédito é infraestrutura, em três pontos:

1. **Na hora de baixar**, uma ficha `.credito.json` é gravada ao lado do
   áudio. Sem ela, meses depois, o crédito seria impossível de reconstruir —
   o MP3 na pasta não diz de quem é.
2. **Na tela de resultado**, o texto pronto aparece com um botão de copiar. O
   momento de usar o crédito é o de publicar, e é ali que ele tem que estar.
3. **Ao lado do vídeo**, como `<nome>-creditos.txt`. Publicar pode ser dias
   depois, de outra máquina, e aí a tela já sumiu.

Faixa `CC0` **não gera nada** — não exige crédito, e encher a descrição do
anúncio com atribuição desnecessária gasta espaço que deveria vender o imóvel.

A leitura da ficha é estrita: JSON corrompido, licença desconhecida, autor em
branco ou campo faltando devolvem `null`, e o vídeo sai sem crédito. A pasta
é editável pelo usuário, e **afirmar a licença errada num post publicado é
pior que não afirmar nada**.

### Decisão de produto: buscar não é sortear

A automação para na **busca e no download**. O app não escolhe trilha sozinho
a cada vídeo, e isso foi deliberado: corretor constrói identidade sonora —
quem assiste três vídeos do mesmo corretor reconhece a trilha. Sortear uma
faixa por vídeo destruiria isso em nome de economizar um clique.

### Segurança e limites

* **A pasta de destino vem das preferências, no processo main** — nunca do
  renderer. Aceitar um caminho vindo da tela daria à interface o poder de
  escrever em qualquer lugar do disco.
* **É o único ponto do app que sai pra internet por conta própria**, e só
  quando o usuário digita e aperta buscar. Todo o resto roda offline.
* **`fetch` com prazo de 15s**: API fora do ar não pode deixar a tela travada
  pra sempre.
* **Leitura defensiva**: item sem `id`, `url` ou `title` é descartado em vez
  de virar faixa quebrada na lista.

### O que NÃO pôde ser verificado aqui

**O formato da resposta da API.** O ambiente de desenvolvimento deste projeto
não tem saída pra internet (`403 to CONNECT` no proxy), então a chamada HTTP
real nunca rodou. Os campos seguem a documentação pública.

Isso é dito aqui porque muda o que os testes provam. Eles cobrem o
comportamento **com um dublê no lugar da rede**: o filtro de licença, o
descarte de item incompleto, a mensagem de erro legível, o nome de arquivo, a
ficha de crédito. O que eles **não** provam é que os campos da Openverse se
chamam o que este código espera.

A leitura defensiva existe justamente por isso: se a API divergir, o sintoma
será **"nenhum resultado"** — nunca uma faixa que não toca ou um crédito
errado. A verificação real é rodar a busca na máquina do usuário; se o
formato divergir, é ajuste de nome de campo, não de arquitetura.

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
* **Uma trilha só, sem corte no ritmo da música.** Os fades são fixos (1s na
  entrada, 2s na saída).
* **O app não hospeda música.** Ele busca e baixa da Openverse, já filtrada
  por licença segura pra uso comercial, mas quem escolhe é o usuário — e
  faixa trazida de fora pelo botão "Adicionar música" continua sem nenhuma
  verificação de licença: música comercial em post de Instagram ou YouTube
  costuma ser silenciada ou bloqueada automaticamente.
* **A chamada HTTP à Openverse nunca rodou contra o servidor real** (o
  ambiente de desenvolvimento não tem saída pra internet). Se o formato da
  resposta divergir, a busca devolve "nenhum resultado" — nunca faixa
  quebrada. Verificação real é na máquina do usuário.
* **O logo não tem posição configurável** além do canto inferior direito, nem
  controle de tamanho.
