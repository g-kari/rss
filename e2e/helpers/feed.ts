/**
 * Feed ファクトリ — e2e spec の共通ヘルパー (#711 案 B 段階的 sweep Phase 0)。
 *
 * 21 spec ファイルで重複定義されていた `makeFeed` を集約。
 * `architecture.md` テストカバレッジマップセクションの規約「共通ファクトリは
 * `e2e/helpers/` に配置」に準拠する。
 *
 * ## 使い方
 *
 * ```typescript
 * import { makeFeed } from "./helpers/feed";
 *
 * const f = makeFeed(); // デフォルト値で生成
 * const g = makeFeed({ id: "abc", url: "https://example.com/rss.xml", title: "Custom" });
 * ```
 *
 * 全フィールドが optional な `Partial<Feed>` で override 可能。
 */

import type { Feed } from "../../src/types";

/**
 * デフォルト値を持つ Feed を生成する。
 * 任意のフィールドを `overrides` で上書き可能。
 */
export function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "test-feed-id",
    url: "https://example.com/rss.xml",
    title: "Test Feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    ...overrides,
  };
}
