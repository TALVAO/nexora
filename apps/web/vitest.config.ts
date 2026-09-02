import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Setup mínimo de testes do apps/web. Os arquivos testados aqui são lógica
 * pura (ex.: lib/api.ts), sem necessidade de DOM — daí `environment: "node"`.
 * O alias replica o mesmo `@/*` -> `./src/*` já definido em tsconfig.json,
 * senão imports com o alias quebram dentro dos testes.
 */
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
