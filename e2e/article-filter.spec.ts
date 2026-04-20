import { test, expect } from "@playwright/test";
import { filterAndSortArticles, type ArticleFilterOptions } from "../src/lib/article-filter";
import type { Article, Feed, KeywordFilter } from "../src/types";
import {
  buildFilterMap,
  normalizeFilter,
  type CompiledKeywordFilter,
} from "../src/lib/keyword-filter";
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
  feedFilterMap: new Map(),
  readIds: new Set(),
  bookmarkIds: new Set(),
  readingListIds: new Set(),
  likeIds: new Set(),
  historyIds: new Set(),
  historyOrder: [],
  unreadOnly: false,
  bookmarkOnly: false,
  readingListOnly: false,
  likeOnly: false,
  noteOnly: false,
  noteIds: new Set(),
  query: "",
  sortOrder: "newest",
  dateRange: "all",
  activeIds: new Set(),
  nsfwMode: false,
  nsfwFeedIds: new Set(),
  globalFilter: null,
  readBeforeTimestamp: null,
};

type RunOptions = Omit<Partial<ArticleFilterOptions>, "globalFilter"> & {
  globalFilter?: KeywordFilter | CompiledKeywordFilter | null;
};

function run(articles: Article[], opts: RunOptions = {}): Article[] {
  const { globalFilter, ...rest } = opts;
  const compiled =
    globalFilter == null || "includePatterns" in globalFilter
      ? (globalFilter as CompiledKeywordFilter | null | undefined)
      : normalizeFilter(globalFilter);
  return filterAndSortArticles(articles, { ...BASE_OPTS, ...rest, globalFilter: compiled ?? null });
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
    const result = run([excluded, kept], { feedFilterMap: buildFilterMap([feed], (f) => f.id) });
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
    const result = run([matched, unmatched], {
      feedFilterMap: buildFilterMap([feed], (f) => f.id),
    });
    expect(ids(result)).toContain("m1");
    expect(ids(result)).not.toContain("u1");
  });

  test("activeIds に含まれる記事はキーワードフィルターをスキップする", () => {
    const result = run([matched, unmatched], {
      feedFilterMap: buildFilterMap([feed], (f) => f.id),
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
// グローバルフィルター
// ==========================================================================

test.describe("グローバルフィルター — exclude", () => {
  const article = makeArticle("g1", "feed1", { title: "スパム広告の記事" });
  const kept = makeArticle("g2", "feed1", { title: "通常の記事" });

  test("exclude キーワードにマッチする記事は除外される", () => {
    const result = run([article, kept], {
      globalFilter: { include: [], exclude: ["スパム"] },
    });
    expect(ids(result)).not.toContain("g1");
    expect(ids(result)).toContain("g2");
  });

  test("exclude キーワードは大文字小文字を区別しない", () => {
    const upperCase = makeArticle("gu1", "feed1", { title: "SPAM 記事" });
    const result = run([upperCase, kept], {
      globalFilter: { include: [], exclude: ["spam"] },
    });
    expect(ids(result)).not.toContain("gu1");
    expect(ids(result)).toContain("g2");
  });
});

test.describe("グローバルフィルター — include", () => {
  const matched = makeArticle("gi1", "feed1", { title: "TypeScript の記事" });
  const unmatched = makeArticle("gi2", "feed2", { title: "Python の記事" });

  test("include キーワードにマッチしない記事は除外される", () => {
    const result = run([matched, unmatched], {
      globalFilter: { include: ["typescript"], exclude: [] },
    });
    expect(ids(result)).toContain("gi1");
    expect(ids(result)).not.toContain("gi2");
  });

  test("include が空なら全記事を通過させる", () => {
    const result = run([matched, unmatched], {
      globalFilter: { include: [], exclude: [] },
    });
    expect(result).toHaveLength(2);
  });
});

test.describe("グローバルフィルター — 複数フィードに横断適用", () => {
  const feed1Article = makeArticle("cf1", "feed1", { title: "除外ワードを含む feed1 記事" });
  const feed2Article = makeArticle("cf2", "feed2", { title: "除外ワードを含む feed2 記事" });
  const normalArticle = makeArticle("cfn", "feed3", { title: "通常記事" });

  test("グローバルフィルターはすべてのフィードに適用される", () => {
    const result = run([feed1Article, feed2Article, normalArticle], {
      globalFilter: { include: [], exclude: ["除外ワード"] },
    });
    expect(ids(result)).not.toContain("cf1");
    expect(ids(result)).not.toContain("cf2");
    expect(ids(result)).toContain("cfn");
  });
});

test.describe("グローバルフィルター — activeIds はフィルターをスキップ", () => {
  const article = makeArticle("ga1", "feed1", { title: "除外されるべき記事" });

  test("activeIds に含まれる記事はグローバルフィルターをスキップする", () => {
    const result = run([article], {
      globalFilter: { include: [], exclude: ["除外されるべき"] },
      activeIds: new Set(["ga1"]),
    });
    expect(ids(result)).toContain("ga1");
  });
});

test.describe("グローバルフィルター + フィード別フィルターの組み合わせ", () => {
  const feed: Feed = {
    id: "feed1",
    url: "https://example.com/feed",
    title: "テストフィード",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    filter: { include: ["TypeScript"], exclude: [] },
  };
  const tsSpam = makeArticle("ts1", "feed1", { title: "TypeScript スパム広告" });
  const tsGood = makeArticle("ts2", "feed1", { title: "TypeScript の良記事" });
  const python = makeArticle("py1", "feed1", { title: "Python の記事" });

  test("フィード別フィルターとグローバルフィルターが AND 条件で適用される", () => {
    const result = run([tsSpam, tsGood, python], {
      feedFilterMap: buildFilterMap([feed], (f) => f.id),
      globalFilter: { include: [], exclude: ["スパム"] },
    });
    // feed.filter の include: ["TypeScript"] → python は除外
    // globalFilter の exclude: ["スパム"] → tsSpam は除外
    expect(ids(result)).toContain("ts2");
    expect(ids(result)).not.toContain("ts1");
    expect(ids(result)).not.toContain("py1");
  });
});

// ==========================================================================
// readBeforeTimestamp フィルター
// ==========================================================================

test.describe("readBeforeTimestamp — 一括既読タイムスタンプ", () => {
  const old = makeArticle("old1", "feed1", { publishedAt: "2024-01-01T00:00:00Z" });
  const recent = makeArticle("rec1", "feed1", { publishedAt: "2024-06-01T00:00:00Z" });

  test("readBeforeTimestamp 以前の記事は unreadOnly 時に除外される", () => {
    const result = run([old, recent], {
      unreadOnly: true,
      readBeforeTimestamp: "2024-03-01T00:00:00Z",
    });
    expect(ids(result)).not.toContain("old1");
    expect(ids(result)).toContain("rec1");
  });

  test("readBeforeTimestamp と同じ日時の記事も既読扱い", () => {
    const result = run([old, recent], {
      unreadOnly: true,
      readBeforeTimestamp: "2024-01-01T00:00:00Z",
    });
    expect(ids(result)).not.toContain("old1");
    expect(ids(result)).toContain("rec1");
  });

  test("readBeforeTimestamp が null のとき readIds 未登録記事は未読扱い", () => {
    const result = run([old, recent], {
      unreadOnly: true,
      readBeforeTimestamp: null,
    });
    expect(result).toHaveLength(2);
  });

  test("readIds と readBeforeTimestamp は OR で適用される", () => {
    const result = run([old, recent], {
      unreadOnly: true,
      readIds: new Set(["old1"]),
      readBeforeTimestamp: "2024-07-01T00:00:00Z",
    });
    // old1 は readIds で既読、recent は readBeforeTimestamp で既読 → 全件除外
    expect(result).toHaveLength(0);
  });
});

// ==========================================================================
// snoozedUntil フィルター
// ==========================================================================

test.describe("snoozedUntil — スヌーズ", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1時間後
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1時間前

  test("未来のスヌーズ時刻の記事は非表示", () => {
    const result = run([A1, A2], {
      snoozedUntil: { a1: future },
    });
    expect(ids(result)).not.toContain("a1");
    expect(ids(result)).toContain("a2");
  });

  test("過去のスヌーズ時刻（期限切れ）の記事は表示される", () => {
    const result = run([A1, A2], {
      snoozedUntil: { a1: past },
    });
    expect(ids(result)).toContain("a1");
  });

  test("スヌーズ中でも activeIds に含まれれば表示される", () => {
    const result = run([A1, A2], {
      snoozedUntil: { a1: future },
      activeIds: new Set(["a1"]),
    });
    expect(ids(result)).toContain("a1");
  });

  test("snoozedUntil が空オブジェクトのとき全記事を表示", () => {
    const result = run([A1, A2], {
      snoozedUntil: {},
    });
    expect(result).toHaveLength(2);
  });
});

// ==========================================================================
// readingTimeRange フィルター
// ==========================================================================

test.describe("readingTimeRange — 読了時間フィルター", () => {
  // readingTime(content ?? summary) の計算:
  //   CJK 500文字/分、英語 200語/分、最低1分
  //   short: ≤5分、medium: 5〜15分、long: >15分
  //
  // "あ" は U+3042（ひらがな）→ CJK_PATTERN にマッチ
  //   100文字 → ceil(100/500) = 1分（short）
  //  3000文字 → ceil(3000/500) = 6分（medium）
  //  8000文字 → ceil(8000/500) = 16分（long）

  const shortContent = "あ".repeat(100);
  const mediumContent = "あ".repeat(3000);
  const longContent = "あ".repeat(8000);

  const shortArticle = makeArticle("rt_s", "feed1", { content: shortContent });
  const mediumArticle = makeArticle("rt_m", "feed1", { content: mediumContent });
  const longArticle = makeArticle("rt_l", "feed1", { content: longContent });

  test("readingTimeRange=all のとき全記事を返す", () => {
    const result = run([shortArticle, mediumArticle, longArticle], { readingTimeRange: "all" });
    expect(result).toHaveLength(3);
  });

  test("readingTimeRange=short のとき5分以内の記事だけを返す", () => {
    const result = run([shortArticle, mediumArticle, longArticle], { readingTimeRange: "short" });
    expect(ids(result)).toContain("rt_s");
    expect(ids(result)).not.toContain("rt_m");
    expect(ids(result)).not.toContain("rt_l");
  });

  test("readingTimeRange=medium のとき5〜15分の記事だけを返す", () => {
    const result = run([shortArticle, mediumArticle, longArticle], { readingTimeRange: "medium" });
    expect(ids(result)).not.toContain("rt_s");
    expect(ids(result)).toContain("rt_m");
    expect(ids(result)).not.toContain("rt_l");
  });

  test("readingTimeRange=long のとき15分超の記事だけを返す", () => {
    const result = run([shortArticle, mediumArticle, longArticle], { readingTimeRange: "long" });
    expect(ids(result)).not.toContain("rt_s");
    expect(ids(result)).not.toContain("rt_m");
    expect(ids(result)).toContain("rt_l");
  });

  test("読了時間フィルター中でも activeIds に含まれれば表示される", () => {
    const result = run([shortArticle, longArticle], {
      readingTimeRange: "short",
      activeIds: new Set(["rt_l"]),
    });
    expect(ids(result)).toContain("rt_s");
    expect(ids(result)).toContain("rt_l");
  });
});

// ==========================================================================
// エッジケース
// ==========================================================================

test.describe("noteOnly — メモありフィルター", () => {
  test("noteOnly=true のときメモがある記事だけを返す", () => {
    const result = run([A1, A2, A3], {
      noteOnly: true,
      noteIds: new Set([A1.id, A3.id]),
    });
    expect(result.map((a) => a.id)).toEqual([A1.id, A3.id]);
  });

  test("noteOnly=false のとき全記事を返す", () => {
    const result = run([A1, A2, A3], {
      noteOnly: false,
      noteIds: new Set([A1.id]),
    });
    expect(result).toHaveLength(3);
  });

  test("noteOnly=true でも activeIds に含まれれば表示される", () => {
    const result = run([A1, A2, A3], {
      noteOnly: true,
      noteIds: new Set([A1.id]),
      activeIds: new Set([A2.id]),
    });
    expect(result.map((a) => a.id)).toContain(A2.id);
    expect(result.map((a) => a.id)).not.toContain(A3.id);
  });
});

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

// ==========================================================================
// viewFeedIds フィルター — FeedView カテゴリタブ横断表示
// ==========================================================================

test.describe("viewFeedIds フィルター — FeedView カテゴリ横断", () => {
  const picArticle = makeArticle("pic1", "feedPic");
  const vidArticle = makeArticle("vid1", "feedVid");
  const artArticle = makeArticle("art1", "feedArt");
  const pool = [picArticle, vidArticle, artArticle];

  test("feedId=null で viewFeedIds が指定されていれば、そのフィード群の記事だけ残す", () => {
    const result = run(pool, {
      feedId: null,
      viewFeedIds: new Set(["feedPic"]),
    });
    expect(ids(result)).toEqual(["pic1"]);
  });

  test("viewFeedIds に複数フィードが含まれる場合、その全てを横断表示する", () => {
    const result = run(pool, {
      feedId: null,
      viewFeedIds: new Set(["feedPic", "feedVid"]),
    });
    expect(ids(result).sort()).toEqual(["pic1", "vid1"]);
  });

  test("feedId が指定されている場合は viewFeedIds を無視する（個別フィードを優先）", () => {
    const result = run(pool, {
      feedId: "feedArt",
      viewFeedIds: new Set(["feedPic"]),
    });
    expect(ids(result)).toEqual(["art1"]);
  });

  test("groupFeedIds が設定されていれば viewFeedIds より優先される（グループが明示選択）", () => {
    const result = run(pool, {
      feedId: null,
      groupFeedIds: new Set(["feedArt"]),
      viewFeedIds: new Set(["feedPic"]),
    });
    expect(ids(result)).toEqual(["art1"]);
  });

  test("viewFeedIds が空 Set の場合は記事なし（該当フィードなしの表現）", () => {
    const result = run(pool, {
      feedId: null,
      viewFeedIds: new Set(),
    });
    expect(result).toHaveLength(0);
  });

  test("viewFeedIds が未指定（undefined）の場合は全記事を返す（既存挙動維持）", () => {
    const result = run(pool, { feedId: null });
    expect(ids(result)).toEqual(["pic1", "vid1", "art1"]);
  });
});
