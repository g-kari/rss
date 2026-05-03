import { test, expect } from "@playwright/test";
import {
  computeFeedHash,
  computeArticleId,
  computePrivateFeedHash,
  pMap,
  assembleClientFeed,
  mergeNewArticles,
  PAGE_SIZE,
  MAX_FEEDS_PER_USER,
  MAX_PAGES,
  KNOWN_IDS_MAX,
  MAX_USER_ARTICLES,
  R2_CONCURRENCY,
} from "../src/lib/shared-feed";
import type { SharedFeedMeta, UserSubscription, Article } from "../src/types";

// ── ヘルパー ──────────────────────────────────────────────────────

function makeArticle(id: string, publishedAt: string, extra: Partial<Article> = {}): Article {
  return {
    id,
    feedHash: "abc123",
    guid: `guid-${id}`,
    title: `Title ${id}`,
    link: `https://example.com/${id}`,
    summary: `Summary ${id}`,
    publishedAt,
    createdAt: publishedAt,
    ...extra,
  };
}

function makeMeta(overrides: Partial<SharedFeedMeta> = {}): SharedFeedMeta {
  return {
    feedHash: "abc123",
    url: "https://example.com/feed.xml",
    title: "Example Feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    articleCount: 0,
    pageCount: 0,
    knownIds: [],
    ...overrides,
  };
}

function makeSub(overrides: Partial<UserSubscription> = {}): UserSubscription {
  return {
    feedHash: "abc123",
    url: "https://example.com/feed.xml",
    subscribedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** R2Bucket の最低限モック */
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

// ── 定数 ──────────────────────────────────────────────────────────

test.describe("定数値", () => {
  test("PAGE_SIZE は 500", () => {
    expect(PAGE_SIZE).toBe(500);
  });

  test("MAX_FEEDS_PER_USER は 1000", () => {
    expect(MAX_FEEDS_PER_USER).toBe(1000);
  });

  test("MAX_PAGES は 500", () => {
    expect(MAX_PAGES).toBe(500);
  });

  test("KNOWN_IDS_MAX は 10000", () => {
    expect(KNOWN_IDS_MAX).toBe(10_000);
  });

  test("MAX_USER_ARTICLES は 10000", () => {
    expect(MAX_USER_ARTICLES).toBe(10_000);
  });

  test("R2_CONCURRENCY は 10", () => {
    expect(R2_CONCURRENCY).toBe(10);
  });
});

// ── computeFeedHash ──────────────────────────────────────────────

test.describe("computeFeedHash", () => {
  test("同じ URL に対して決定論的なハッシュを返す", async () => {
    const h1 = await computeFeedHash("https://example.com/feed.xml");
    const h2 = await computeFeedHash("https://example.com/feed.xml");
    expect(h1).toBe(h2);
  });

  test("ハッシュは 16 文字の 16 進数", async () => {
    const h = await computeFeedHash("https://example.com/feed.xml");
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  test("異なる URL は異なるハッシュを返す", async () => {
    const h1 = await computeFeedHash("https://example.com/feed1.xml");
    const h2 = await computeFeedHash("https://example.com/feed2.xml");
    expect(h1).not.toBe(h2);
  });

  test("空文字列もハッシュを生成する", async () => {
    const h = await computeFeedHash("");
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ── computeArticleId ──────────────────────────────────────────────

test.describe("computeArticleId", () => {
  test("同じ feedUrl + guid で同じ ID を返す", async () => {
    const id1 = await computeArticleId("https://example.com/feed.xml", "guid-123");
    const id2 = await computeArticleId("https://example.com/feed.xml", "guid-123");
    expect(id1).toBe(id2);
  });

  test("ID は 16 文字の 16 進数", async () => {
    const id = await computeArticleId("https://example.com/feed.xml", "guid-123");
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  test("異なる guid は異なる ID を返す", async () => {
    const id1 = await computeArticleId("https://example.com/feed.xml", "guid-1");
    const id2 = await computeArticleId("https://example.com/feed.xml", "guid-2");
    expect(id1).not.toBe(id2);
  });

  test("異なる feedUrl は異なる ID を返す", async () => {
    const id1 = await computeArticleId("https://a.com/feed.xml", "guid-1");
    const id2 = await computeArticleId("https://b.com/feed.xml", "guid-1");
    expect(id1).not.toBe(id2);
  });

  test("feedUrl|guid の区切り文字がハッシュに影響する", async () => {
    // "a|b" と "a" + "|b" は同じだが "ab" + "|" とは異なる
    const id1 = await computeArticleId("a", "b");
    const id2 = await computeArticleId("a|b", "");
    expect(id1).not.toBe(id2);
  });
});

// ── computePrivateFeedHash ──────────────────────────────────────

test.describe("computePrivateFeedHash", () => {
  test("同じ feedUrl + userId で決定論的なハッシュを返す", async () => {
    const h1 = await computePrivateFeedHash("https://example.com/feed.xml", "user1");
    const h2 = await computePrivateFeedHash("https://example.com/feed.xml", "user1");
    expect(h1).toBe(h2);
  });

  test("ハッシュは 16 文字の 16 進数", async () => {
    const h = await computePrivateFeedHash("https://example.com/feed.xml", "user1");
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  test("共有フィードハッシュと衝突しない", async () => {
    const url = "https://example.com/feed.xml";
    const shared = await computeFeedHash(url);
    const priv = await computePrivateFeedHash(url, "user1");
    expect(shared).not.toBe(priv);
  });

  test("異なる userId は異なるハッシュを返す", async () => {
    const url = "https://example.com/feed.xml";
    const h1 = await computePrivateFeedHash(url, "user1");
    const h2 = await computePrivateFeedHash(url, "user2");
    expect(h1).not.toBe(h2);
  });
});

// ── pMap ──────────────────────────────────────────────────────────

test.describe("pMap", () => {
  test("全要素に fn を適用して結果配列を返す", async () => {
    const result = await pMap([1, 2, 3], async (x) => x * 2, 10);
    expect(result).toEqual([2, 4, 6]);
  });

  test("空配列を渡すと空配列を返す", async () => {
    const result = await pMap([], async (x: number) => x * 2, 10);
    expect(result).toEqual([]);
  });

  test("結果の順序は入力と一致する", async () => {
    // 遅い処理が先に来ても順序が保持されること
    const result = await pMap(
      [30, 10, 20],
      async (ms) => {
        await new Promise((r) => setTimeout(r, ms));
        return ms;
      },
      10,
    );
    expect(result).toEqual([30, 10, 20]);
  });

  test("concurrency=1 で逐次実行される", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    await pMap(
      [1, 2, 3],
      async (x) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return x;
      },
      1,
    );
    expect(maxConcurrent).toBe(1);
  });

  test("concurrency=2 で最大2並行になる", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    await pMap(
      [1, 2, 3, 4],
      async (x) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent--;
        return x;
      },
      2,
    );
    expect(maxConcurrent).toBe(2);
  });

  test("要素数が concurrency より少ない場合はその数だけ並行", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    await pMap(
      [1, 2],
      async (x) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return x;
      },
      10,
    );
    expect(maxConcurrent).toBe(2);
  });

  test("fn がエラーを投げた場合は reject される", async () => {
    await expect(
      pMap(
        [1, 2, 3],
        async (x) => {
          if (x === 2) throw new Error("fail");
          return x;
        },
        10,
      ),
    ).rejects.toThrow("fail");
  });
});

// ── assembleClientFeed ──────────────────────────────────────────

test.describe("assembleClientFeed", () => {
  test("SharedFeedMeta と UserSubscription を Feed に合成する", () => {
    const meta = makeMeta({
      feedHash: "hash1",
      url: "https://example.com/feed.xml",
      title: "Original Title",
      siteUrl: "https://example.com",
      lastFetchedAt: "2026-01-01T00:00:00Z",
      fetchError: null,
      pageCount: 2,
    });
    const sub = makeSub({
      feedHash: "hash1",
      url: "https://example.com/feed.xml",
    });
    const feed = assembleClientFeed(meta, sub);

    expect(feed.id).toBe("hash1");
    expect(feed.url).toBe("https://example.com/feed.xml");
    expect(feed.title).toBe("Original Title");
    expect(feed.siteUrl).toBe("https://example.com");
    expect(feed.lastFetchedAt).toBe("2026-01-01T00:00:00Z");
    expect(feed.fetchError).toBeNull();
    expect(feed.pageCount).toBe(2);
  });

  test("customTitle がある場合はそれを使う", () => {
    const meta = makeMeta({ title: "Original" });
    const sub = makeSub({ customTitle: "Custom Title" });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.title).toBe("Custom Title");
  });

  test("customTitle が undefined なら meta.title を使う", () => {
    const meta = makeMeta({ title: "Original" });
    const sub = makeSub();
    const feed = assembleClientFeed(meta, sub);
    expect(feed.title).toBe("Original");
  });

  test("filter を UserSubscription から引き継ぐ", () => {
    const meta = makeMeta();
    const sub = makeSub({
      filter: { include: ["tech"], exclude: ["spam"] },
    });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.filter).toEqual({ include: ["tech"], exclude: ["spam"] });
  });

  test("nsfw フラグを引き継ぐ", () => {
    const meta = makeMeta();
    const sub = makeSub({ nsfw: true });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.nsfw).toBe(true);
  });

  test("nsfw が未設定の場合は false になる", () => {
    const meta = makeMeta();
    const sub = makeSub();
    const feed = assembleClientFeed(meta, sub);
    expect(feed.nsfw).toBe(false);
  });

  test("priority を引き継ぐ", () => {
    const meta = makeMeta();
    const sub = makeSub({ priority: "high" });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.priority).toBe("high");
  });

  test("category を引き継ぐ", () => {
    const meta = makeMeta();
    const sub = makeSub({ category: "tech" });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.category).toBe("tech");
  });

  test("groupId を引き継ぐ", () => {
    const meta = makeMeta();
    const sub = makeSub({ groupId: "group1" });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.groupId).toBe("group1");
  });

  test("cssSelectors がある場合 isScraping=true になる", () => {
    const meta = makeMeta({
      cssSelectors: {
        articleLink: "a.article-link",
        model: "test-model",
        generatedAt: "2026-01-01T00:00:00Z",
      },
    });
    const sub = makeSub();
    const feed = assembleClientFeed(meta, sub);
    expect(feed.isScraping).toBe(true);
    expect(feed.cssSelector).toBe("a.article-link");
  });

  test("cssSelectors がない場合 isScraping=false になる", () => {
    const meta = makeMeta();
    const sub = makeSub();
    const feed = assembleClientFeed(meta, sub);
    expect(feed.isScraping).toBe(false);
    expect(feed.cssSelector).toBeUndefined();
  });

  test("consecutiveErrors を引き継ぐ", () => {
    const meta = makeMeta({ consecutiveErrors: 5, lastErrorAt: "2026-01-01T00:00:00Z" });
    const sub = makeSub();
    const feed = assembleClientFeed(meta, sub);
    expect(feed.consecutiveErrors).toBe(5);
    expect(feed.lastErrorAt).toBe("2026-01-01T00:00:00Z");
  });

  test("rateLimitedUntil を引き継ぐ", () => {
    const meta = makeMeta({ rateLimitedUntil: "2026-02-01T00:00:00Z" });
    const sub = makeSub();
    const feed = assembleClientFeed(meta, sub);
    expect(feed.rateLimitedUntil).toBe("2026-02-01T00:00:00Z");
  });

  test("failedSelectors を引き継ぐ", () => {
    const meta = makeMeta({ failedSelectors: ["a.bad", "div.wrong"] });
    const sub = makeSub();
    const feed = assembleClientFeed(meta, sub);
    expect(feed.failedSelectors).toEqual(["a.bad", "div.wrong"]);
  });

  test("mutedUntil を UserSubscription から引き継ぐ", () => {
    const meta = makeMeta();
    const sub = makeSub({ mutedUntil: "2026-03-01T00:00:00Z" });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.mutedUntil).toBe("2026-03-01T00:00:00Z");
  });

  test("view を UserSubscription から引き継ぐ", () => {
    const meta = makeMeta();
    const sub = makeSub({ view: "pictures" });
    const feed = assembleClientFeed(meta, sub);
    expect(feed.view).toBe("pictures");
  });

  test("oversizeAlert を引き継ぐ（デフォルト false）", () => {
    const meta = makeMeta();
    const sub = makeSub();
    expect(assembleClientFeed(meta, sub).oversizeAlert).toBe(false);

    const metaWithAlert = makeMeta({ oversizeAlert: true });
    expect(assembleClientFeed(metaWithAlert, sub).oversizeAlert).toBe(true);
  });
});

// ── mergeNewArticles (R2モック使用) ──────────────────────────────

test.describe("mergeNewArticles", () => {
  test("空の fetchedArticles は空配列を返す", async () => {
    const { bucket } = makeR2Mock();
    const meta = makeMeta();
    const result = await mergeNewArticles(bucket, meta, []);
    expect(result).toEqual([]);
  });

  test("新規記事を latest.json に書き込む", async () => {
    const { bucket, store } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1" });

    const articles = [
      makeArticle("a1", "2026-01-02T00:00:00Z"),
      makeArticle("a2", "2026-01-01T00:00:00Z"),
    ];

    const brandNew = await mergeNewArticles(bucket, meta, articles);

    expect(brandNew).toHaveLength(2);
    const stored = JSON.parse(store.get("feeds/feed1/articles/latest.json")!) as Article[];
    expect(stored).toHaveLength(2);
    // 日付降順でソートされる
    expect(stored[0].id).toBe("a1");
    expect(stored[1].id).toBe("a2");
  });

  test("既存の latest.json がある場合にマージする", async () => {
    const { bucket, store } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1" });

    store.set(
      "feeds/feed1/articles/latest.json",
      JSON.stringify([makeArticle("old1", "2026-01-01T00:00:00Z")]),
    );

    const articles = [makeArticle("new1", "2026-01-02T00:00:00Z")];
    const brandNew = await mergeNewArticles(bucket, meta, articles);

    expect(brandNew).toHaveLength(1);
    expect(brandNew[0].id).toBe("new1");
    const stored = JSON.parse(store.get("feeds/feed1/articles/latest.json")!) as Article[];
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe("new1");
    expect(stored[1].id).toBe("old1");
  });

  test("重複する記事 ID は追加されない", async () => {
    const { bucket, store } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1", knownIds: ["a1"] });

    store.set(
      "feeds/feed1/articles/latest.json",
      JSON.stringify([makeArticle("a1", "2026-01-01T00:00:00Z")]),
    );

    const articles = [
      makeArticle("a1", "2026-01-02T00:00:00Z"), // 既存と同じ ID
    ];
    const brandNew = await mergeNewArticles(bucket, meta, articles);
    expect(brandNew).toEqual([]);
  });

  test("既存記事の内容が変わった場合に更新する（brandNew は空）", async () => {
    const { bucket, store } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1", knownIds: ["a1"] });

    store.set(
      "feeds/feed1/articles/latest.json",
      JSON.stringify([makeArticle("a1", "2026-01-01T00:00:00Z", { title: "Old Title" })]),
    );

    const articles = [makeArticle("a1", "2026-01-01T00:00:00Z", { title: "New Title" })];
    const brandNew = await mergeNewArticles(bucket, meta, articles);

    expect(brandNew).toEqual([]);
    const stored = JSON.parse(store.get("feeds/feed1/articles/latest.json")!) as Article[];
    expect(stored[0].title).toBe("New Title");
  });

  test("既存記事の更新時に createdAt は保持される", async () => {
    const { bucket, store } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1", knownIds: ["a1"] });

    store.set(
      "feeds/feed1/articles/latest.json",
      JSON.stringify([
        makeArticle("a1", "2026-01-01T00:00:00Z", {
          title: "Old",
          createdAt: "2025-12-01T00:00:00Z",
        }),
      ]),
    );

    const articles = [
      makeArticle("a1", "2026-01-01T00:00:00Z", {
        title: "New",
        createdAt: "2026-05-01T00:00:00Z",
      }),
    ];
    await mergeNewArticles(bucket, meta, articles);

    const stored = JSON.parse(store.get("feeds/feed1/articles/latest.json")!) as Article[];
    expect(stored[0].createdAt).toBe("2025-12-01T00:00:00Z");
  });

  test("articleCount が新規記事の分だけ増える", async () => {
    const { bucket } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1", articleCount: 5 });

    const articles = [
      makeArticle("new1", "2026-01-02T00:00:00Z"),
      makeArticle("new2", "2026-01-01T00:00:00Z"),
    ];
    await mergeNewArticles(bucket, meta, articles);

    expect(meta.articleCount).toBe(7);
  });

  test("knownIds が更新される", async () => {
    const { bucket } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1", knownIds: [] });

    const articles = [
      makeArticle("new1", "2026-01-02T00:00:00Z"),
      makeArticle("new2", "2026-01-01T00:00:00Z"),
    ];
    await mergeNewArticles(bucket, meta, articles);

    expect(meta.knownIds).toBeDefined();
    expect(meta.knownIds!).toContain("new1");
    expect(meta.knownIds!).toContain("new2");
  });

  test("knownIds が KNOWN_IDS_MAX を超えた場合は古い方から切り詰められる", async () => {
    const { bucket } = makeR2Mock();
    // knownIds を上限近くまで埋める
    const existingIds = Array.from({ length: KNOWN_IDS_MAX - 1 }, (_, i) => `old-${i}`);
    const meta = makeMeta({ feedHash: "feed1", knownIds: existingIds });

    // 新規 3 件追加 → 上限超過
    const articles = [
      makeArticle("new1", "2026-01-03T00:00:00Z"),
      makeArticle("new2", "2026-01-02T00:00:00Z"),
      makeArticle("new3", "2026-01-01T00:00:00Z"),
    ];
    await mergeNewArticles(bucket, meta, articles);

    expect(meta.knownIds!.length).toBeLessThanOrEqual(KNOWN_IDS_MAX);
    // 新しい記事は必ず含まれる
    expect(meta.knownIds!).toContain("new1");
    expect(meta.knownIds!).toContain("new2");
    expect(meta.knownIds!).toContain("new3");
  });

  test("既存記事に変更がなければ R2 PUT しない", async () => {
    const { bucket, store } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1", knownIds: ["a1"] });

    const original = makeArticle("a1", "2026-01-01T00:00:00Z");
    store.set("feeds/feed1/articles/latest.json", JSON.stringify([original]));

    // 同じ内容で mergeNewArticles を呼ぶ
    const articles = [makeArticle("a1", "2026-01-01T00:00:00Z")];

    let putCalled = false;
    const originalPut = bucket.put;
    bucket.put = async (...args: Parameters<R2Bucket["put"]>) => {
      putCalled = true;
      return originalPut.apply(bucket, args) as ReturnType<R2Bucket["put"]>;
    };

    await mergeNewArticles(bucket, meta, articles);
    expect(putCalled).toBe(false);
  });

  test("existingLatest を渡せば R2 GET をスキップする", async () => {
    const { bucket } = makeR2Mock();
    const meta = makeMeta({ feedHash: "feed1" });

    const existingLatest = [makeArticle("old1", "2026-01-01T00:00:00Z")];
    const articles = [makeArticle("new1", "2026-01-02T00:00:00Z")];

    let getCalled = false;
    const originalGet = bucket.get;
    bucket.get = async (...args: Parameters<R2Bucket["get"]>) => {
      getCalled = true;
      return originalGet.apply(bucket, args) as ReturnType<R2Bucket["get"]>;
    };

    const brandNew = await mergeNewArticles(bucket, meta, articles, existingLatest);
    expect(brandNew).toHaveLength(1);
    expect(getCalled).toBe(false);
  });

  test("knownIds がない場合は latest の ID で重複チェックする（後方互換）", async () => {
    const { bucket, store } = makeR2Mock();
    // knownIds を意図的に undefined にする
    const meta = makeMeta({ feedHash: "feed1" });
    delete (meta as unknown as Record<string, unknown>).knownIds;

    store.set(
      "feeds/feed1/articles/latest.json",
      JSON.stringify([makeArticle("a1", "2026-01-01T00:00:00Z")]),
    );

    // a1 は latest にあるので重複とみなされる
    const articles = [
      makeArticle("a1", "2026-01-02T00:00:00Z"),
      makeArticle("new1", "2026-01-03T00:00:00Z"),
    ];
    const brandNew = await mergeNewArticles(bucket, meta, articles);

    expect(brandNew).toHaveLength(1);
    expect(brandNew[0].id).toBe("new1");
  });
});
