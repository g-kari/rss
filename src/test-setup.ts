/**
 * vitest 用テストセットアップ (#682 Phase A)
 *
 * @testing-library/jest-dom の matcher (toBeInTheDocument 等) を vitest に拡張する。
 * 全 `*.test.{ts,tsx}` ファイルで自動的に有効化される。
 */
import "@testing-library/jest-dom/vitest";
