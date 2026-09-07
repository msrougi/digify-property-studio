import { join } from "node:path";
import { app, BrowserWindow, net, protocol } from "electron";
import { bootstrap } from "../infrastructure/bootstrap.js";
import { clearSessionData } from "../infrastructure/sessionData.js";
import { registerIpcHandlers } from "./ipc.js";
import { MEDIA_PROTOCOL, mediaUrlToFileUrl } from "../shared/media.js";

/**
 * Esquema customizado para o renderer reproduzir vídeos locais sem acesso
 * direto a `fs` (Least Privilege — docs/reference/original-docs/18 - Security
 * Architecture.md). O renderer nunca lê o disco: só monta uma URL via
 * `toMediaUrl` (`../shared/media.ts`), o processo principal é quem resolve
 * para bytes reais via `net.fetch`. `stream: true` é obrigatório para o
 * elemento <video> conseguir fazer seek (range requests).
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/** Handle do banco da sessão atual — precisa ser fechado antes de apagar o arquivo ao sair. */
let sessionDb: { close(): void } | null = null;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Digify Property Studio",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("Falha ao carregar preload", preloadPath, error);
  });

  // Sem isto, um erro de JavaScript no renderer resulta em JANELA BRANCA e
  // NADA no terminal: quem está rodando o app fica olhando uma tela vazia
  // sem uma única pista, e o erro só aparece se souber abrir o DevTools.
  // Foi exatamente o que aconteceu num teste real.
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`);
  });

  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    // O caso clássico em desenvolvimento: o Electron sobe antes do servidor
    // do Vite responder, e a janela fica branca pra sempre.
    console.error(`[renderer] não carregou ${url}: ${description} (${code})`);
  });

  // Em dev/xvfb-run: apps/desktop/out/main/../../models = apps/desktop/models.
  // Empacotado (electron-builder): `models` vai via `extraResources` pra
  // `resourcesPath`, fora do app.asar — modelos ONNX grandes não podem ser
  // abertos de dentro do asar por bibliotecas nativas (onnxruntime-node),
  // só arquivos lidos via `fs` puro do Node (ver electron-builder.yml).
  const modelsDir = app.isPackaged ? join(process.resourcesPath, "models") : join(__dirname, "../../models");

  // A janela já está VISÍVEL neste ponto. Sem este try, qualquer falha aqui
  // (a mais comum: o binário nativo do banco compilado pro ABI errado) deixa
  // o `loadURL` abaixo sem ser executado — e o usuário fica olhando uma
  // janela branca, muda, com o erro perdido no terminal. Aconteceu de
  // verdade, e custou uma sessão inteira pra diagnosticar.
  try {
    const digify = bootstrap(app.getPath("userData"), modelsDir);
    sessionDb = digify.db;
    registerIpcHandlers(digify, window);
  } catch (error) {
    console.error("[início] falha ao preparar o app:", error);
    showStartupError(window, error);
    return;
  }

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/** Escapa texto pra ir dentro do HTML da tela de erro. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Mostra na própria janela por que o app não subiu.
 *
 * O erro já vai pro terminal, mas quem abre o app pelo ícone não tem
 * terminal nenhum pra olhar — e mesmo quem roda pelo terminal costuma ver só
 * o fim do log, onde este erro já rolou pra cima.
 */
function showStartupError(window: BrowserWindow, error: unknown): void {
  const mensagem = error instanceof Error ? error.message : String(error);

  // O erro de ABI é de longe o mais frequente em desenvolvimento, e a
  // mensagem original do Node fala de `NODE_MODULE_VERSION` — o que não diz
  // nada pra quem só quer abrir o app. Aqui vira a instrução concreta.
  const ehErroDeAbi = /NODE_MODULE_VERSION|did not self-register/i.test(mensagem);
  const receita = ehErroDeAbi
    ? `<p>O banco de dados foi compilado para outra versão. Rode isto e abra de novo:</p>
       <pre>pnpm --filter @digify/desktop rebuild:electron</pre>
       <p class="nota">Para voltar a rodar os testes depois:
       <code>pnpm --filter @digify/desktop rebuild:node</code></p>`
    : "<p>Confira o terminal para o rastro completo.</p>";

  const html = `<!doctype html><meta charset="utf-8">
<style>
  body { font: 15px/1.6 system-ui, sans-serif; margin: 0; padding: 40px;
         background: #111318; color: #e6e8ee; }
  h1 { font-size: 19px; margin: 0 0 16px; }
  pre { background: #1c2029; border: 1px solid #2c3340; border-radius: 8px;
        padding: 12px; overflow-x: auto; white-space: pre-wrap;
        word-break: break-word; user-select: text; }
  .nota { color: #98a0b3; font-size: 13px; }
  code { background: #1c2029; padding: 2px 5px; border-radius: 4px; }
</style>
<h1>O aplicativo não conseguiu iniciar</h1>
${receita}
<pre>${escapeHtml(mensagem)}</pre>`;

  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

void app.whenReady().then(() => {
  protocol.handle(MEDIA_PROTOCOL, (request) => {
    return net.fetch(mediaUrlToFileUrl(request.url));
  });

  // Sessão sempre começa do zero (ver `clearSessionData`). Antes do
  // bootstrap, senão estaríamos apagando o banco já aberto.
  clearSessionData(app.getPath("userData"));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Limpa também na saída pra não deixar vídeos renderizados (podem ser
// centenas de MB) ocupando disco até a próxima abertura. O banco precisa
// ser fechado antes: no Windows, arquivo aberto não pode ser removido.
app.on("will-quit", () => {
  try {
    sessionDb?.close();
  } catch (error) {
    console.error("[sessão] falha ao fechar o banco:", error);
  }
  sessionDb = null;
  clearSessionData(app.getPath("userData"));
});

app.on("window-all-closed", () => {
  app.quit();
});
