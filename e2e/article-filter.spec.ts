import { test, expect } from "@playwright/test";
import { filterAndSortArticles, type ArticleFilterOptions } from "../src/lib/article-filter";
import type { Article, Feed } from "../src/types";
import { SPECIAL_FEED_IDS } from "../src/lib/storage";

/**
 * filterAndSortArticles の単体テスト。
 *
 * - フィード絞り込み（特殊フィード・通常フィード）
 * - NSFW フィルター
 * - キーワードフィルター（feed.filter）
 * - 未読フィルター・ブックマークフィルター
 * - 検索クエリ
 * - 日付範囲フィルター
 * - ソート順（newest / oldest / 履歴順）
 * - activeIds によるフィルター除外（グレースピリオド）
 */

// ── ヘルパー ──────────────────────────────────────────────────────

function makeArticle(id: string, feedHash: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    feedHash,
    guid: id,
    title: overrides.title ?? `記事 ${id}`,
    link: `https://example.com/${id}`,
    summary: overrides.summary ?? `サマリー ${id}`,
    publishedAt: overrides.publishedAt ?? "2024-06-01T00:00:00Z",
    createdAt: overrides.createdAt ?? "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

const BASE_OPTS: ArticleFilterOptions = {
  feedId: null,
  feeds: [],
  readIds: new Set(),
  bookmarkIds: new Set(),
  readingListIds: new Set(),
  likeIds: new Set(),
  historyIds: new Set(),
  historyOrder: [],
  unreadOnly: false,
  bookmarkOnly: false,
  readingListOnly: false,
  query: "",
  sortOrder: "newest",
  dateRange: "all",
  activeIds: new Set(),
  nsfwMode: false,
  nsfwFeedIds: new Set(),
};

function run(articles: Article[], opts: Partial<ArticleFilterOptions> = {}): Article[] {
  return filterAndSortArticles(articles, { ...BASE_OPTS, ...opts });
}

function ids(articles: Article[]): string[] {
  return articles.map((a) => a.id);
}

// ── テストデータ ─────────────────────────────────────────────────

const A1 = makeArticle("a1", "feed1");
const A2 = makeArticle("a2", "feed1");
const A3 = makeArticle("a3", "feed2");

// ==========================================================================
// フィード絞り込み
// ==========================================================================

test.describe("feedId フィルター — null（全記事）", () => {
  test("feedId が null のとき全記事を返す", () => {
    const result = run([A1, A2, A3]);
    expect(ids(result)).toEqual(["a1", "a2", "a3"]);
  });
});

test.describe("feedId フィルター — 通常フィード", () => {
  test("指定 feedHash と一致する記事だけを返す", () => {
    const result = run([A1, A2, A3], { feedId: "feed1" });
    expect(ids(result)).toEqual(["a1", "a2"]);
  });

  test("一致する記事がない場合は空配列を返す", () => {
    const result = run([A1, A2], { feedId: "feed99" });
    expect(result).toHaveLength(0);
  });
});

test.describe("feedId フィルター — BOOKMARKS 特殊フィード", () => {
  test("ブックマーク済みの記事だけを返す", () => {
    const result = run([A1, A2, A3], {
      feedId: SPECIAL_FEED_IDS.BOOKMARKS,
      bookmarkIds: new Set(["a2"]),
    });
    expect(ids(result)).toEqual(["a2"]);
  });

  test("ブックマーク未登録は除外される", () => {
    const result = run([A1, A2], {
      feedId: SPECIAL_FEED_IDS.BOOKMARKS,
      bookmarkIds: new Set(),
    });
    expect(result).toHaveLength(0);
  });
});

test.describe("feedId フィルター — READING_LIST 特殊フィード", () => {
  test("後で読む登録済みの記事だけを返す", () => {
    const result = run([A1, A2, A3], {
      feedId: SPECIAL_FEED_IDS.READING_LIST,
      readingListIds: new Set(["a3"]),
    });
    expect(ids(result)).toEqual(["a3"]);
  });
});

test.describe("feedId フィルター — LIKES 特殊フィード", () => {
  test("いいね済みの記事だけを返す", () => {
    const result = run([A1, A2, A3], {
      feedId: SPECIAL_FEED_IDS.LIKES,
      likeIds: new Set(["a1", "a3"]),
    });
    expect(ids(result)).toContain("a1");
    expect(ids(result)).toContain("a3");
    expect(ids(result)).not.toContain("a2");
  });
});

test.describe("feedId フィルター — HISTORY 特殊フィード", () => {
  test("閲覧履歴にある記事だけを返す", () => {
    const result = run([A1, A2, A3], {
      feedId: SPECIAL_FEED_IDS.HISTORY,
      historyIds: new Set(["a2"]),
      historyOrder: ["a2"],
    });
    expect(ids(result)).toEqual(["a2"]);
  });
});

// ==========================================================================
// NSFW フィルター
// ==========================================================================

test.describe("NSFW フィルター", () => {
  const nsfwFeedIds = new Set(["feedNSFW"]);
  const nsfwArticle = makeArticle("nsfw1", "feedNSFW");
  const normalArticle = makeArticle("normal1", "feedNormal");

  test("nsfwMode=false のとき NSFW フィードの記事は非表示", () => {
    const result = run([nsfwArticle, normalArticle], {
      nsfwMode: false,
      nsfwFeedIds,
    });
    expect(ids(result)).not.toContain("nsfw1");
    expect(ids(result)).toContain("normal1");
  });

  test("nsfwMode=true のとき NSFW フィードの記事も表示", () => {
    const result = run([nsfwArticle, normalArticle], {
      nsfwMode: true,
      nsfwFeedIds,
    });
    expect(ids(result)).toContain("nsfw1");
    expect(ids(result)).toContain("normal1");
  });

  test("NSFW 記事でも activeIds に含まれれば表示される", () => {
    const result = run([nsfwArticle, normalArticle], {
      nsfwMode: false,
      nsfwFeedIds,
      activeIds: new Set(["nsfw1"]),
    });
    expect(ids(result)).toContain("nsfw1");
  });
});

// ==========================================================================
// キーワードフィルター（feed.filter）
// ==========================================================================

test.describe("キーワードフィルター — exclude", () => {
  const feed: Feed = {
    id: "feed1",
    url: "https://example.com/feed",
    title: "テストフィード",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    filter: { include: [], exclude: ["除外キーワード"] },
  };
  const excluded = makeArticle("ex1", "feed1", { title: "除外キーワードを含む記事" });
  const kept = makeArticle("k1", "feed1", { title: "通常の記事" });

  test("exclude キーワードを含む記事は除外される", () => {
    const result = run([excluded, kept], { feeds: [feed] });
    expect(ids(result)).not.toContain("ex1");
    expect(ids(result)).toContain("k1");
  });
});

test.describe("キーワードフィルター — include", () => {
  const feed: Feed = {
    id: "feed1",
    url: "https://example.com/feed",
    title: "テストフィード",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    filter: { include: ["TypeScript"], exclude: [] },
  };
  const matched = makeArticle("m1", "feed1", { title: "TypeScript の記事" });
  const unmatched = makeArticle("u1", "feed1", { title: "Python の記事" });

  test("include キーワードにマッチしない記事は除外される", () => {
    const result = run([matched, unmatched], { feeds: [feed] });
    expect(ids(result)).toContain("m1");
    expect(ids(result)).not.toContain("u1");
  });

  test("activeIds に含まれる記事はキーワードフィルターをスキップする", () => {
    const result = run([matched, unmatched], {
      feeds: [feed],
      activeIds: new Set(["u1"]),
    });
    expect(ids(result)).toContain("u1");
  });
});

// ==========================================================================
// 未読フィルター・ブックマークフィルター
// ==========================================================================

test.describe("unreadOnly フィルター", () => {
  test("unreadOnly=true のとき既読記事は除外される", () => {
    const result = run([A1, A2, A3], {
      unreadOnly: true,
      readIds: new Set(["a2"]),
    });
    expect(ids(result)).toContain("a1");
    expect(ids(result)).not.toContain("a2");
    expect(ids(result)).toContain("a3");
  });

  test("既読でも activeIds に含まれれば表示される", () => {
    const result = run([A1, A2], {
      unreadOnly: true,
      readIds: new Set(["a1"]),
      activeIds: new Set(["a1"]),
    });
    expect(ids(result)).toContain("a1");
  });

  test("unreadOnly=false のとき既読記事も表示される", () => {
    const result = run([A1, A2], {
      unreadOnly: false,
      readIds: new Set(["a1", "a2"]),
    });
    expect(result).toHaveLength(2);
  });
});

test.describe("bookmarkOnly フィルター", () => {
  test("bookmarkOnly=true のときブックマーク未登録は除外される", () => {
    const result = run([A1, A2, A3], {
      bookmarkOnly: true,
      bookmarkIds: new Set(["a1"]),
    });
    expect(ids(result)).toEqual(["a1"]);
  });

  test("ブックマーク未登録でも activeIds に含まれれば表示される", () => {
    const result = run([A1, A2], {
      bookmarkOnly: true,
      bookmarkIds: new Set(["a1"]),
      activeIds: new Set(["a2"]),
    });
    expect(ids(result)).toContain("a2");
  });
});

// ==========================================================================
// 検索クエリ
// ==========================================================================

test.describe("検索クエリ", () => {
  const article = makeArticle("q1", "feed1", {
    title: "TypeScript 入門",
    summary: "モナドとファンクター",
  });

  test("タイトルにマッチする記事を返す", () => {
    const result = run([article, A1], { query: "TypeScript" });
    expect(ids(result)).toContain("q1");
    expect(ids(result)).not.toContain("a1");
  });

  test("サマリーにマッチする記事を返す", () => {
    const result = run([article, A1], { query: "モナド" });
    expect(ids(result)).toContain("q1");
  });

  test("クエリが空なら全記事を返す", () => {
    const result = run([A1, A2, A3], { query: "" });
    expect(result).toHaveLength(3);
  });

  test("マッチしないクエリなら空配列を返す", () => {
    const result = run([article], { query: "Rust" });
    expect(result).toHaveLength(0);
  });
});

// ==========================================================================
// 日付範囲フィルター
// ==========================================================================

test.describe("日付範囲フィルター", () => {
  // 現在時刻を基準にしたテスト用記事
  const now = new Date();
  const todayIso = now.toISOString();
  const lastWeekIso = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const lastMonthIso = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000).toISOString();

  const recent = makeArticle("recent", "feed1", { publishedAt: todayIso });
  const week = makeArticle("week", "feed1", { publishedAt: lastWeekIso });
  const month = makeArticle("month", "feed1", { publishedAt: lastMonthIso });

  test("dateRange=all のとき全期間の記事を返す", () => {
    const result = run([recent, week, month], { dateRange: "all" });
    expect(result).toHaveLength(3);
  });

  test("dateRange=today のとき今日の記事だけを返す", () => {
    const result = run([recent, week, month], { dateRange: "today" });
    expect(ids(result)).toContain("recent");
    expect(ids(result)).not.toContain("week");
    expect(ids(result)).not.toContain("month");
  });

  test("dateRange=week のとき7日以内の記事だけを返す", () => {
    const result = run([recent, week, month], { dateRange: "week" });
    expect(ids(result)).toContain("recent");
    expect(ids(result)).not.toContain("week"); // 8日前は除外
    expect(ids(result)).not.toContain("month");
  });

  test("dateRange=month のとき1ヶ月以内の記事だけを返す", () => {
    const result = run([recent, week, month], { dateRange: "month" });
    expect(ids(result)).toContain("recent");
    expect(ids(result)).toContain("week");
    expect(ids(result)).not.toContain("month"); // 32日前は除外
  });

  test("publishedAt が null の記事は日付フィルターで除外される", () => {
    const noDate = makeArticle("nodate", "feed1", { publishedAt: null });
    const result = run([noDate, recent], { dateRange: "today" });
    expect(ids(result)).not.toContain("nodate");
    expect(ids(result)).toContain("recent");
  });
});

// ==========================================================================
// ソート順
// ==========================================================================

test.describe("ソート順 — newest / oldest", () => {
  const older = makeArticle("old", "feed1", { publishedAt: "2024-01-01T00:00:00Z" });
  const newer = makeArticle("new", "feed1", { publishedAt: "2024-06-01T00:00:00Z" });

  test("sortOrder=newest のとき入力順を保持する（先頭が最新）", () => {
    // filterAndSortArticles は articles の順序をそのまま保つ（newest は逆転させない）
    const result = run([newer, older], { sortOrder: "newest" });
    expect(ids(result)[0]).toBe("new");
    expect(ids(result)[1]).toBe("old");
  });

  test("sortOrder=oldest のとき逆順になる", () => {
    const result = run([newer, older], { sortOrder: "oldest" });
    expect(ids(result)[0]).toBe("old");
    expect(ids(result)[1]).toBe("new");
  });
});

test.describe("ソート順 — HISTORY（閲覧順）", () => {
  test("HISTORY フィードは historyOrder の順に並ぶ", () => {
    const h1 = makeArticle("h1", "feed1");
    const h2 = makeArticle("h2", "feed1");
    const h3 = makeArticle("h3", "feed1");

    const result = run([h1, h2, h3], {
      feedId: SPECIAL_FEED_IDS.HISTORY,
      historyIds: new Set(["h1", "h2", "h3"]),
      historyOrder: ["h3", "h1", "h2"], // 最近閲覧した順
    });
    expect(ids(result)).toEqual(["h3", "h1", "h2"]);
  });

  test("sortOrder=oldest でも HISTORY は historyOrder を優先する", () => {
    const h1 = makeArticle("h1", "feed1");
    const h2 = makeArticle("h2", "feed1");

    const result = run([h1, h2], {
      feedId: SPECIAL_FEED_IDS.HISTORY,
      historyIds: new Set(["h1", "h2"]),
      historyOrder: ["h2", "h1"],
      sortOrder: "oldest",
    });
    expect(ids(result)).toEqual(["h2", "h1"]);
  });
});

// ==========================================================================
// activeIds（グレースピリオド）
// ==========================================================================

test.describe("activeIds — フィルターをバイパスする", () => {
  test("unreadOnly + readIds でも activeIds に含まれれば残る", () => {
    const result = run([A1, A2], {
      unreadOnly: true,
      readIds: new Set(["a1", "a2"]),
      activeIds: new Set(["a1"]),
    });
    expect(ids(result)).toContain("a1");
    expect(ids(result)).not.toContain("a2");
  });

  test("bookmarkOnly でも activeIds に含まれれば残る", () => {
    const result = run([A1, A2], {
      bookmarkOnly: true,
      bookmarkIds: new Set(), // ブックマークなし
      activeIds: new Set(["a1"]),
    });
    expect(ids(result)).toContain("a1");
    expect(ids(result)).not.toContain("a2");
  });

  test("feedId フィルターは activeIds でバイパスされない（仕様通り）", () => {
    // activeIds はフィード絞り込みには影響しない
    const result = run([A1, A3], {
      feedId: "feed1",
      activeIds: new Set(["a3"]), // feed2 の記事
    });
    expect(ids(result)).not.toContain("a3");
  });
});

// ==========================================================================
// 複合フィルター
// ==========================================================================

test.describe("複合フィルター", () => {
  test("feedId + unreadOnly の組み合わせ", () => {
    const read = makeArticle("r1", "feed1");
    const unread = makeArticle("u1", "feed1");
    const other = makeArticle("o1", "feed2");

    const result = run([read, unread, other], {
      feedId: "feed1",
      unreadOnly: true,
      readIds: new Set(["r1"]),
    });
    expect(ids(result)).toEqual(["u1"]);
  });

  test("検索クエリ + 未読フィルターの組み合わせ", () => {
    const readTs = makeArticle("rt1", "feed1", { title: "TypeScript 既読" });
    const unreadTs = makeArticle("ut1", "feed1", { title: "TypeScript 未読" });
    const unreadPy = makeArticle("up1", "feed1", { title: "Python 未読" });

    const result = run([readTs, unreadTs, unreadPy], {
      unreadOnly: true,
      readIds: new Set(["rt1"]),
      query: "TypeScript",
    });
    expect(ids(result)).toEqual(["ut1"]);
  });
});

// ==========================================================================
// エッジケース
// ==========================================================================

test.describe("エッジケース", () => {
  test("articles が空なら空配列を返す", () => {
    const result = run([]);
    expect(result).toHaveLength(0);
  });

  test("全フィルターが OFF（デフォルト）のとき入力をそのまま返す", () => {
    const result = run([A1, A2, A3]);
    expect(result).toHaveLength(3);
  });
});
