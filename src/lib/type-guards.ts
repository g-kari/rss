import type { Feed, Article, ReadState } from "@/types";

/**
 * plain object (非 null / 非配列の object) 判定。
 *
 * `JSON.parse` 結果など unknown 由来の値を安全に `Record<string, unknown>` へ narrow するための
 * 3 軸 narrowing (`typeof === "object"` / `!== null` / `!Array.isArray`) を 1 箇所に集約する。
 * `typeof null === "object"` の罠と配列混入を同時に排除できる。
 *
 * 規範: `browser-platform.md § JSON.parse 結果は unknown 受け + 3 軸 narrowing`
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isReadState(v: unknown): v is ReadState {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    Array.isArray(obj.readIds) &&
    Array.isArray(obj.bookmarkIds) &&
    Array.isArray(obj.readingListIds) &&
    Array.isArray(obj.likeIds)
  );
}

export function isFeed(v: unknown): v is Feed {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.url === "string" &&
    typeof obj.title === "string" &&
    typeof obj.siteUrl === "string"
  );
}

export function isArticle(v: unknown): v is Article {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.id === "string" && typeof obj.feedHash === "string" && typeof obj.title === "string"
  );
}
