/**
 * Article ファクトリ — e2e spec の共通ヘルパー (#711 案 B 段階的 sweep Phase 0)。
 *
 * 21 spec ファイルで重複定義されていた `makeArticle` を集約。
 * `architecture.md` テストカバレッジマップセクションの規約「共通ファクトリは
 * `e2e/helpers/` に配置」に準拠する。
 *
 * ## 使い方
 *
 * ```typescript
 * import { makeArticle } from "./helpers/article";
 *
 * const a = makeArticle(); // デフォルト値で生成
 * const b = makeArticle({ id: "x", feedHash: "h", publishedAt: "2026-01-01T00:00:00Z" });
 * ```
 *
 * 全フィールドが optional な `Partial<Article>` で override 可能。
 * 位置引数派の signature (旧 `makeArticle(id, feedHash, publishedAt)`) は採用しなかった
 * — テストの可読性が落ちるため、override object 1 種に統一する案 B (#711) 採用。
 */

import type { Article } from "../../src/types";

/**
 * デフォルト値を持つ Article を生成する。
 * 任意のフィールドを `overrides` で上書き可能。
 */
export function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "test-article-id",
    feedHash: "test-feed-hash",
    guid: "test-guid",
    title: "Test Article",
    link: "https://example.com/article",
    summary: "Test summary",
    publishedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
