import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/application/**/*.test.ts", "src/infrastructure/**/*.test.ts"],
  },
});
