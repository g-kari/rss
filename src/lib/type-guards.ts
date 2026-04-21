import type { Feed, Article, ReadState } from "@/types";

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
