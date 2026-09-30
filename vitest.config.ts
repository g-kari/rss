import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * vitest 設定 (#682 Phase A — RTL infra 導入)
 *
 * - happy-dom 環境 (jsdom より高速、既存 devDeps 活用)
 * - `*.test.ts` / `*.test.tsx` を実行 (e2e/*.spec.ts は Playwright で別途)
 * - `src/test-setup.ts` で @testing-library/jest-dom matcher を拡張
 *
 * Phase B 以降で React component test (#634 / #623 等) を追加予定。
 */
export default defineConfig({
  // Resolve build-only OpenNext imports without creating fake production build output.
  plugins: [
    {
      name: "test-opennext-worker",
      resolveId(source, importer) {
        if (
          source.endsWith("/.open-next/worker.js") ||
          (source === "./.open-next/worker.js" && importer?.endsWith("/worker.ts"))
        ) {
          return path.resolve(__dirname, ".open-next/worker.js");
        }
      },
      load(id) {
        if (id === path.resolve(__dirname, ".open-next/worker.js")) {
          return 'export default { fetch() { throw new Error("OpenNext Worker must be mocked in tests"); } };';
        }
      },
    },
  ],
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
