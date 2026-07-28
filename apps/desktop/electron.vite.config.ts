import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Pacotes do workspace precisam ser incluídos no bundle (não externalizados):
// são fonte TypeScript sem etapa de build própria, e o Node não entende .ts
// nativamente ao seguir um require/import externo.
const workspacePackages = ["@digify/domain", "@digify/database", "@digify/pie"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        // .cjs explícito: Electron carrega preload via require(), e como este
        // pacote tem "type": "module" no package.json, um .js normal seria
        // tratado como ESM e o require() falharia com ERR_REQUIRE_ESM — erro
        // que só aparece no evento 'preload-error' do webContents, nunca no
        // console padrão (diagnosticado nesta sessão via esse evento).
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
