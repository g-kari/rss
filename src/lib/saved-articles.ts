import type { Article } from "../types";
import { savedArticlesKey } from "./r2";
import { MAX_SAVED_ARTICLES } from "./validation";

export class SavedArticleLimitError extends Error {}
export class SavedArticleConflictError extends Error {}

/** CAS prevents SingleFile and URL-save requests from losing each other's saved articles. */
export async function upsertSavedArticle(
  bucket: R2Bucket,
  userId: string,
  article: Article,
  replace = false,
): Promise<{ article: Article; created: boolean }> {
  const key = savedArticlesKey(userId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const object = await bucket.get(key);
    const saved = object ? await object.json<Article[]>() : [];
    if (!Array.isArray(saved)) throw new Error("Invalid saved article state");
    const existing = saved.find((item) => item.id === article.id);
    if (existing && !replace) return { article: existing, created: false };
    if (!existing && saved.length >= MAX_SAVED_ARTICLES) throw new SavedArticleLimitError();
    if (object && !object.etag) throw new Error("Missing saved article version");
    const result = await bucket.put(
      key,
      JSON.stringify([article, ...saved.filter((item) => item.id !== article.id)]),
      {
        onlyIf: object ? { etagMatches: object.etag } : new Headers({ "If-None-Match": "*" }),
        httpMetadata: { contentType: "application/json" },
      },
    );
    if (result !== null) return { article, created: !existing };
  }
  throw new SavedArticleConflictError();
}
