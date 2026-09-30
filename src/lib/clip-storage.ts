import type { Article } from "../types";
import { extractMainContent } from "./content";
import { extractOgMeta, stripHtml, stripHtmlWithBreaks, unescapeHtml, sanitizeHtml } from "./html";
import { sha256Hex, userKey, r2Get, r2Put, savedArticlesKey } from "./r2";
import { MAX_SAVED_ARTICLES } from "./validation";
import { upsertSavedArticle, SavedArticleLimitError } from "./saved-articles";
import { prepareClipImages, restoreClipImageUrls, saveClipImages } from "./clip-images";
import { MAX_CLIP_HTML_BYTES } from "./clip";

export class EmptyClipContentError extends Error {}
const clipContentKey = async (userId: string, url: string) =>
  userKey(userId, `clips/${await sha256Hex(url)}.json`);

/** A separate owner-only object keeps large HTML/images out of every article-list response. */
export async function readSavedClip(
  bucket: R2Bucket,
  userId: string,
  url: string,
): Promise<{ content: string } | null> {
  const value = await r2Get<unknown>(bucket, await clipContentKey(userId, url), null);
  if (value === null) return null;
  if (typeof value !== "object" || !("content" in value) || typeof value.content !== "string")
    throw new Error("Invalid clipped content");
  return { content: value.content };
}

export async function persistClip(
  bucket: R2Bucket,
  userId: string,
  html: string,
  url: string,
): Promise<{ article: Article; created: boolean }> {
  const id = (await sha256Hex(`__saved__|${url}`)).slice(0, 16);
  // Check capacity before writing assets. The CAS merge rechecks it after concurrent saves.
  const saved = await r2Get<Article[]>(bucket, savedArticlesKey(userId), []);
  if (!Array.isArray(saved)) throw new Error("Invalid saved article state");
  if (saved.length >= MAX_SAVED_ARTICLES && !saved.some((article) => article.id === id))
    throw new SavedArticleLimitError();
  const prepared = await prepareClipImages(html);
  const extracted = extractMainContent(prepared.html, url).content;
  const content = sanitizeHtml(restoreClipImageUrls(sanitizeHtml(extracted), prepared.images));
  const summary = stripHtmlWithBreaks(content).trim().slice(0, 2000);
  if (
    (!summary && !/<img\b/i.test(content)) ||
    new TextEncoder().encode(content).byteLength > MAX_CLIP_HTML_BYTES
  )
    throw new EmptyClipContentError();
  const pageTitle = unescapeHtml(html.match(/<title\b[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  const title =
    stripHtml(extractOgMeta(html, "title") || pageTitle)
      .trim()
      .slice(0, 500) || url;
  const firstImage = prepared.images.find((image) =>
    content.includes(`/api/clip/images/${image.id}`),
  );
  const article: Article = {
    id,
    feedHash: "__saved__",
    guid: url,
    title,
    link: url,
    summary,
    // Only use inspected private assets. Never promote untrusted data: metadata into a thumbnail.
    ogImage: firstImage ? `/api/clip/images/${firstImage.id}` : undefined,
    publishedAt: null,
    createdAt: new Date().toISOString(),
  };
  await saveClipImages(bucket, userId, prepared.images);
  await r2Put(bucket, await clipContentKey(userId, url), { content });
  return upsertSavedArticle(bucket, userId, article, true);
}
