import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { bootstrap } from "../infrastructure/bootstrap.js";
import { registerIpcHandlers } from "./ipc.js";

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

  const digify = bootstrap(app.getPath("userData"));
  registerIpcHandlers(digify, window);

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
