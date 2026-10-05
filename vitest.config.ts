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
      // Node contract tests cannot import the runtime-only WorkerEntrypoint.
      // Actual Worker behavior is independently exercised in workerd.
      name: "test-cloudflare-workers",
      resolveId(source) {
        if (source === "cloudflare:workers") return "\0test-cloudflare-workers";
      },
      load(id) {
        if (id === "\0test-cloudflare-workers") {
          return "export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }";
        }
      },
    },
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
    server: { deps: { inline: ["@cloudflare/workers-oauth-provider"] } },
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
