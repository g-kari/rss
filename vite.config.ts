import { defineConfig } from "vite-plus";

export default defineConfig({
  // Git ステージ済みファイルへの自動チェック
  staged: { "*": "vp check --fix" },
});
