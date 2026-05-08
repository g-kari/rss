/**
 * e2e テスト用 R2 シードヘルパー。
 *
 * `app/api/test/seed/route.ts` に POST/DELETE を投げて、
 * テスト用ユーザーの R2 データを投入・クリアする。
 *
 * **前提**: `playwright.config.ts` の `webServer.env` で `DEV_AUTH_BYPASS_USER_ID`
 * がセットされていること。
 */

import type { Article } from "../../src/types";

export interface SeedFeedOpts {
  feedHash: string;
  url?: string;
  title?: string;
  articles: Article[];
}

export interface SeedReadStateOpts {
  readIds?: string[];
  bookmarkIds?: string[];
  readingListIds?: string[];
  likeIds?: string[];
}

const SEED_ENDPOINT = "/api/test/seed";

interface SeedRequestBody {
  feeds?: Array<{ feedHash: string; meta: Record<string, unknown>; articles: Article[] }>;
  subscriptions?: Array<{ feedHash: string; url: string; customTitle?: string }>;
  readState?: SeedReadStateOpts;
}

/**
 * フィード（meta + articles）を投入する。subscription も同時に登録する。
 *
 * @param baseURL Playwright の baseURL（例: `http://localhost:3000`）
 */
export async function seedFeed(baseURL: string, opts: SeedFeedOpts): Promise<void> {
  const url = opts.url ?? `https://example.test/${opts.feedHash}/rss.xml`;
  const title = opts.title ?? `Test Feed ${opts.feedHash}`;
  const body: SeedRequestBody = {
    feeds: [
      {
        feedHash: opts.feedHash,
        meta: {
          feedHash: opts.feedHash,
          url,
          title,
          siteUrl: `https://example.test/${opts.feedHash}`,
          articleCount: opts.articles.length,
        },
        articles: opts.articles,
      },
    ],
    subscriptions: [{ feedHash: opts.feedHash, url, customTitle: title }],
  };
  await postSeed(baseURL, body);
}

/** 既読・ブックマーク状態を投入する。 */
export async function seedReadState(baseURL: string, opts: SeedReadStateOpts): Promise<void> {
  await postSeed(baseURL, { readState: opts });
}

/** テスト用ユーザーの R2 データをクリアする。 */
export async function clearTestData(baseURL: string): Promise<void> {
  const res = await fetch(new URL(SEED_ENDPOINT, baseURL), { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`clearTestData failed: ${res.status} ${await res.text()}`);
  }
}

async function postSeed(baseURL: string, body: SeedRequestBody): Promise<void> {
  const res = await fetch(new URL(SEED_ENDPOINT, baseURL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`seed POST failed: ${res.status} ${text}`);
  }
}

/**
 * テスト用 Article を生成するファクトリ。
 *
 * 必要最小限のフィールドだけ指定すれば、他はサンプル値で埋める。
 */
export function makeArticle(overrides: Partial<Article> & { id: string }): Article {
  return {
    feedHash: overrides.feedHash ?? "0123456789abcdef",
    guid: overrides.guid ?? overrides.id,
    title: overrides.title ?? `Article ${overrides.id}`,
    link: overrides.link ?? `https://example.test/articles/${overrides.id}`,
    summary: overrides.summary ?? "Sample summary",
    content: overrides.content,
    ogImage: overrides.ogImage,
    author: overrides.author,
    publishedAt: overrides.publishedAt ?? new Date().toISOString(),
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    categories: overrides.categories,
    metadata: overrides.metadata,
    ...overrides,
  };
}
