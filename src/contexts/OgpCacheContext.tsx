"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OgpCacheEntry } from "@/lib/ogp-cache-schema";

/**
 * #808 Phase 3a: OGP cache を `ArticleList` (useOgpCache 呼出元) と
 * `ArticleContentBody` (useContentLinkPreviews 呼出元) の **sibling 階層** で共有する
 * ための Context。
 *
 * AppShell で `useOgpCache(visible)` を 1 度だけ呼んで Provider value として配布する。
 * 子コンポーネントはこの hook 経由で cache を参照する (重複 fetch を構造的に防ぐ)。
 */

/**
 * OGP cache の access API。caller は `ogpCache` (image-only Record で BC 維持) と
 * `getEntry` (v2 entry 取得、Phase 3b で `useContentLinkPreviews` が title/description
 * 取得に使用) の両方を Context 経由で参照できる。
 */
export interface OgpCacheStore {
  /** v1 互換 Record (URL → image URL) — `resolveThumbnail` 等の既存 caller 用 */
  ogpCache: Record<string, string>;
  /** v2 entry 取得 — `useContentLinkPreviews` 等が title/description 必要時に使用 */
  getEntry: (url: string) => OgpCacheEntry | undefined;
}

const OgpCacheContext = createContext<OgpCacheStore | null>(null);

interface ProviderProps {
  value: OgpCacheStore;
  children: ReactNode;
}

export function OgpCacheProvider({ value, children }: ProviderProps) {
  return <OgpCacheContext.Provider value={value}>{children}</OgpCacheContext.Provider>;
}

/**
 * OGP cache を Context 経由で取得する hook。Provider 外で呼ばれた場合は **null-object**
 * (空 cache + `getEntry` が常に undefined を返す) を返して安全に fallback する設計。
 * これは AppShell の Provider 設置漏れ / test 環境で Provider なしのときに silent fail
 * せずに既存挙動 (cache なし → 都度 fetch) を維持するため。
 */
export function useOgpCacheContext(): OgpCacheStore {
  const ctx = useContext(OgpCacheContext);
  if (ctx) return ctx;
  // null-object fallback: Provider 外で呼ばれた場合の safe default
  return {
    ogpCache: {},
    getEntry: () => undefined,
  };
}
