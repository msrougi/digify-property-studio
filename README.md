# Digify Property Studio

Aplicativo de desktop que transforma material bruto de imóvel em vídeo de
anúncio pronto pra publicar. Dois caminhos:

* **Melhorar um vídeo existente** — analisa cenas, reconhece ambientes,
  corrige luz, cor, perspectiva e reflexo, e remove bagunça quadro a quadro.
* **Montar um vídeo do zero** — a partir de fotos, PDF e páginas de site, com
  trilha, legenda e a sua marca.

Documentação de arquitetura em [`docs/00-ARCHITECTURE.md`](docs/00-ARCHITECTURE.md);
o caminho de montagem de vídeo em [`docs/SLIDESHOW.md`](docs/SLIDESHOW.md).

## Rodar o app

Precisa de **Node 20 ou mais novo** e **pnpm 9**. Se não tiver o pnpm:
`npm install -g pnpm@9.15.0`.

```bash
pnpm install
pnpm --filter @digify/desktop rebuild:electron
pnpm dev:desktop
```

O primeiro `pnpm install` demora — o projeto traz FFmpeg e o runtime de ONNX.
Na primeira execução o `dev:desktop` também remonta o modelo de inpainting
(~196 MB, versionado em partes porque o GitHub não aceita arquivo desse
tamanho); isso é automático e acontece uma vez só.

### Por que o `rebuild:electron`

O `better-sqlite3` é um módulo nativo, e o binário precisa bater com quem o
carrega. Ele vem compilado pro **Node** depois do `pnpm install`, mas o app
roda dentro do **Electron**, que usa outro ABI. Sem esse passo o app abre e
morre com `NODE_MODULE_VERSION` ou `Module did not self-register`.

**A troca vale nos dois sentidos**: pra rodar os testes, volte pro ABI do
Node. Esquecer disso faz 23 testes de banco falharem de uma vez, por um
motivo que não tem nada a ver com o código que você acabou de escrever.

Se o app abrir com a **janela em branco**, é quase sempre isto: o `bootstrap`
falha antes de carregar a interface. A partir de agora a janela mostra o erro
e o comando pra resolver, em vez de ficar branca e muda.

```bash
pnpm --filter @digify/desktop rebuild:node   # antes de testar
pnpm --filter @digify/desktop rebuild:electron  # antes de abrir o app
```

## Testes

```bash
pnpm --filter @digify/desktop rebuild:node
pnpm test
```

Os testes são de verdade: renderizam vídeo com FFmpeg, rodam os modelos ONNX
e conferem os pixels do resultado. Por isso a suíte leva ~45 s em vez de
milissegundos — não há mock do que importa.

## Gerar o instalador

```bash
pnpm --filter @digify/desktop build:installer
```

Leia [`docs/PACKAGING.md`](docs/PACKAGING.md) antes. Resumo do que morde:
o binário nativo é corrigido pra **uma** plataforma/arquitetura por vez, a do
host — então empacotar pra Mac num Linux gera um pacote quebrado. Builde na
plataforma de destino.

## Onde ficam seus arquivos

Projetos e vídeos são apagados a cada abertura: a ferramenta é de passagem,
não arquivo. O que **sobrevive** é configuração sua — logo, modo do logo e
pasta de trilhas, em `preferencias.json` na pasta de dados do app.
