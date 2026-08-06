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

  // Em dev/xvfb-run: apps/desktop/out/main/../../models = apps/desktop/models.
  // Empacotado (electron-builder): `models` vai via `extraResources` pra
  // `resourcesPath`, fora do app.asar — modelos ONNX grandes não podem ser
  // abertos de dentro do asar por bibliotecas nativas (onnxruntime-node),
  // só arquivos lidos via `fs` puro do Node (ver electron-builder.yml).
  const modelsDir = app.isPackaged ? join(process.resourcesPath, "models") : join(__dirname, "../../models");
  const digify = bootstrap(app.getPath("userData"), modelsDir);
  sessionDb = digify.db;
  registerIpcHandlers(digify, window);

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
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
