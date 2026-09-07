import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/application/**/*.test.ts",
      "src/infrastructure/**/*.test.ts",
      // Lógica pura do renderer (formatação, limpeza de mensagem de erro).
      // Componente React não entra aqui: não há ambiente de DOM configurado, e
      // a verificação de tela neste projeto é feita abrindo o app de verdade.
      "src/renderer/**/*.test.ts",
    ],
  },
});
