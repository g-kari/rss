import { test, expect } from "@playwright/test";
import { cascadeOverflow } from "../src/lib/shared-feed";
import type { Article } from "../src/types";

/**
 * Issue #131: cascadeOverflow で MAX_PAGES 超過時の overflow が silent drop される
 * 問題の回帰テスト。
 *
 * テスト用に pageSize / maxPages を小さくして同じシナリオを再現する。
 */

function makeArticle(id: string, publishedAt: string): Article {
  return {
    id,
    feedHash: "abc",
    guid: id,
    title: `Title ${id}`,
    link: `https://example.com/${id}`,
    summary: "",
    publishedAt,
    createdAt: publishedAt,
  };
}

/** Cloudflare R2Bucket の最低限のモック（get / put のみ） */
function makeR2Mock() {
  const store = new Map<string, string>();
  const bucket = {
    get: async (key: string) => {
      const body = store.get(key);
      if (body === undefined) return null;
      return {
        json: async <T>() => JSON.parse(body) as T,
      };
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
      return undefined;
    },
  } as unknown as R2Bucket;
  return { bucket, store };
}

test("cascadeOverflow: 既存の空きに収まる場合は1ページ書き込んで終了", async () => {
  const { bucket, store } = makeR2Mock();
  const overflow = [
    makeArticle("a1", "2026-01-03T00:00:00Z"),
    makeArticle("a2", "2026-01-02T00:00:00Z"),
  ];

  const result = await cascadeOverflow(bucket, "feed1", overflow, 2, {
    maxPages: 5,
    pageSize: 3,
  });

  expect(result.lastWrittenPage).toBe(2);
  expect(result.oversized).toBe(false);
  expect(store.size).toBe(1);
  const p2 = JSON.parse(store.get("feeds/feed1/articles/p2.json")!) as Article[];
  expect(p2).toHaveLength(2);
  expect(p2[0].id).toBe("a1");
});

test("cascadeOverflow: ページ溢れ時に次ページへカスケードする", async () => {
  const { bucket, store } = makeR2Mock();
  // p2 に既に 2件あり、pageSize=3 なので 1件分しか空きがない
  store.set(
    "feeds/feed1/articles/p2.json",
    JSON.stringify([
      makeArticle("old1", "2025-12-31T00:00:00Z"),
      makeArticle("old2", "2025-12-30T00:00:00Z"),
    ]),
  );

  const overflow = [
    makeArticle("new1", "2026-01-03T00:00:00Z"),
    makeArticle("new2", "2026-01-02T00:00:00Z"),
    makeArticle("new3", "2026-01-01T00:00:00Z"),
  ];

  const result = await cascadeOverflow(bucket, "feed1", overflow, 2, {
    maxPages: 5,
    pageSize: 3,
  });

  expect(result.lastWrittenPage).toBe(3);
  expect(result.oversized).toBe(false);
  const p2 = JSON.parse(store.get("feeds/feed1/articles/p2.json")!) as Article[];
  const p3 = JSON.parse(store.get("feeds/feed1/articles/p3.json")!) as Article[];
  expect(p2).toHaveLength(3);
  expect(p3).toHaveLength(2);
  // 新しい記事ほど若いページに配置される
  expect(p2.map((a) => a.id)).toEqual(["new1", "new2", "new3"]);
  expect(p3.map((a) => a.id)).toEqual(["old1", "old2"]);
});

test("Issue #131: maxPages 超過時に overflow を silent drop せず末尾ページに追記する", async () => {
  const { bucket, store } = makeR2Mock();
  const maxPages = 3;
  const pageSize = 2;

  // p2, p3 を既に満杯にしておく
  store.set(
    "feeds/feed1/articles/p2.json",
    JSON.stringify([
      makeArticle("p2-a", "2025-06-10T00:00:00Z"),
      makeArticle("p2-b", "2025-06-09T00:00:00Z"),
    ]),
  );
  store.set(
    "feeds/feed1/articles/p3.json",
    JSON.stringify([
      makeArticle("p3-a", "2025-06-08T00:00:00Z"),
      makeArticle("p3-b", "2025-06-07T00:00:00Z"),
    ]),
  );

  // overflow が maxPages を超える量で流れ込む
  const overflow = [
    makeArticle("new1", "2026-01-05T00:00:00Z"),
    makeArticle("new2", "2026-01-04T00:00:00Z"),
    makeArticle("new3", "2026-01-03T00:00:00Z"),
  ];

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);

  try {
    const result = await cascadeOverflow(bucket, "feed1", overflow, 2, {
      maxPages,
      pageSize,
    });

    expect(result.lastWrittenPage).toBe(maxPages);
    expect(result.oversized).toBe(true);
    // 全記事の合計: overflow 3件 + p2(2件) + p3(2件) = 7件
    const allStored = [...store.values()]
      .flatMap((v) => JSON.parse(v) as Article[])
      .map((a) => a.id);
    expect(allStored).toHaveLength(7);
    // 元々の記事 + 新規記事すべてが保存されていること
    expect(new Set(allStored)).toEqual(
      new Set(["new1", "new2", "new3", "p2-a", "p2-b", "p3-a", "p3-b"]),
    );
    // 警告ログが出ていること
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("exceeded MAX_PAGES=3");
  } finally {
    console.warn = originalWarn;
  }
});

test("Issue #131: 末尾ページに追記された結果 pageSize を超過しても記事は失われない", async () => {
  const { bucket, store } = makeR2Mock();
  const maxPages = 2;
  const pageSize = 2;

  // p2 を既に満杯に
  store.set(
    "feeds/feed1/articles/p2.json",
    JSON.stringify([
      makeArticle("p2-a", "2025-06-10T00:00:00Z"),
      makeArticle("p2-b", "2025-06-09T00:00:00Z"),
    ]),
  );

  const overflow = [
    makeArticle("new1", "2026-01-02T00:00:00Z"),
    makeArticle("new2", "2026-01-01T00:00:00Z"),
  ];

  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    await cascadeOverflow(bucket, "feed1", overflow, 2, { maxPages, pageSize });
    const p2 = JSON.parse(store.get("feeds/feed1/articles/p2.json")!) as Article[];
    // pageSize=2 を超過 (4件) するが記事は保持される
    expect(p2).toHaveLength(4);
    expect(p2.map((a) => a.id)).toEqual(["new1", "new2", "p2-a", "p2-b"]);
  } finally {
    console.warn = originalWarn;
  }
});

test("Issue #158: overflow と既存ページで重複する記事が排除される", async () => {
  const { bucket, store } = makeR2Mock();
  // p2 に既存記事あり
  store.set(
    "feeds/feed1/articles/p2.json",
    JSON.stringify([
      makeArticle("dup1", "2025-12-31T00:00:00Z"),
      makeArticle("old1", "2025-12-30T00:00:00Z"),
    ]),
  );

  // overflow に dup1 と同じ id の記事が含まれる
  const overflow = [
    makeArticle("new1", "2026-01-02T00:00:00Z"),
    makeArticle("dup1", "2026-01-01T00:00:00Z"),
  ];

  const result = await cascadeOverflow(bucket, "feed1", overflow, 2, {
    maxPages: 5,
    pageSize: 5,
  });

  expect(result.lastWrittenPage).toBe(2);
  expect(result.oversized).toBe(false);
  const p2 = JSON.parse(store.get("feeds/feed1/articles/p2.json")!) as Article[];
  // dup1 は重複排除されて 1件のみ（overflow 側が優先）
  expect(p2).toHaveLength(3);
  const ids = p2.map((a) => a.id);
  expect(ids.filter((id) => id === "dup1")).toHaveLength(1);
});

test("Issue #158: maxPages 超過時の末尾追記でも重複が排除される", async () => {
  const { bucket, store } = makeR2Mock();
  const maxPages = 2;
  const pageSize = 2;

  // p2 に dup1 が既に存在
  store.set(
    "feeds/feed1/articles/p2.json",
    JSON.stringify([
      makeArticle("dup1", "2025-12-31T00:00:00Z"),
      makeArticle("old1", "2025-12-30T00:00:00Z"),
    ]),
  );

  // overflow に dup1 が重複して含まれる
  const overflow = [
    makeArticle("new1", "2026-01-03T00:00:00Z"),
    makeArticle("new2", "2026-01-02T00:00:00Z"),
    makeArticle("dup1", "2026-01-01T00:00:00Z"),
  ];

  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    await cascadeOverflow(bucket, "feed1", overflow, 2, { maxPages, pageSize });
    const allStored = [...store.values()]
      .flatMap((v) => JSON.parse(v) as Article[])
      .map((a) => a.id);
    // dup1 は 1件のみ: new1, new2, dup1, old1 = 4件
    expect(allStored).toHaveLength(4);
    expect(allStored.filter((id) => id === "dup1")).toHaveLength(1);
  } finally {
    console.warn = originalWarn;
  }
});
