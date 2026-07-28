import { join } from "node:path";
import { app, BrowserWindow, net, protocol } from "electron";
import { bootstrap } from "../infrastructure/bootstrap.js";
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
  // Empacotamento final (electron-builder extraResources) é um passo futuro
  // de packaging — não bloqueia esta fase de desenvolvimento.
  const modelsDir = join(__dirname, "../../models");
  const digify = bootstrap(app.getPath("userData"), modelsDir);
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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
