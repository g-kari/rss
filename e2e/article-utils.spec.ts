import { test, expect } from "@playwright/test";
import {
  readingTime,
  timeAgo,
  createReadingTimeCache,
  compareByDateDesc,
  compareByPublishedAtDesc,
  getArticleTimestamp,
  getDateRangeStart,
} from "../src/lib/article-utils";
import type { Article } from "../src/types";
import { makeArticle as makeBaseArticle } from "./helpers/article";

// このファイル特有の signature (id, content) をラップ — 内部で override object に変換
const makeArticle = (id: string, content: string) => makeBaseArticle({ id, content });

test.describe("getDateRangeStart — 基準日時", () => {
  const now = new Date("2026-08-06T12:34:56.000Z");

  test("固定した基準日時から today/week/month を計算できる", () => {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const week = new Date(now);
    week.setDate(week.getDate() - 7);
    const month = new Date(now);
    month.setMonth(month.getMonth() - 1);
    expect(getDateRangeStart("today", now)).toEqual(today);
    expect(getDateRangeStart("week", now)).toEqual(week);
    expect(getDateRangeStart("month", now)).toEqual(month);
  });

  test("all は基準日時に関係なく null", () => {
    expect(getDateRangeStart("all", now)).toBeNull();
  });
});

/**
 * readingTime の単体テスト。
 *
 * 推定読了時間算出のロジック:
 * - CJK 文字が全体の 30% 超 → 日本語モード: ceil(文字数 / 400) 分
 * - それ以外 → 英語モード: ceil(単語数 / 200) 分
 * - Math.max(1, ...) で最低 1 分を保証（空文字除く）
 */

test.describe("readingTime — 空・HTML タグ", () => {
  test("空文字列は 0 を返す", () => {
    expect(readingTime("")).toBe(0);
  });

  test("HTML タグのみ（テキストなし）は 0 を返す", () => {
    expect(readingTime("<p><strong></strong></p>")).toBe(0);
  });

  test("HTML タグを除去してテキスト量を計算する", () => {
    const plain = "あ".repeat(400);
    const withTags = `<p>${plain}</p>`;
    expect(readingTime(withTags)).toBe(readingTime(plain));
  });

  test("空白のみは 0 を返す", () => {
    expect(readingTime("   \n\t  ")).toBe(0);
  });
});

test.describe("readingTime — 日本語モード (CJK > 30%)", () => {
  test("400 字の日本語は 1 分", () => {
    // cjk/total = 400/400 = 1.0 > 0.3 → ceil(400/400) = 1
    expect(readingTime("あ".repeat(400))).toBe(1);
  });

  test("800 字の日本語は 2 分", () => {
    expect(readingTime("あ".repeat(800))).toBe(2);
  });

  test("1 文字の日本語は最低 1 分", () => {
    // ceil(1/400) = 1 → Math.max(1, 1) = 1
    expect(readingTime("あ")).toBe(1);
  });

  test("1200 字の日本語は 3 分", () => {
    expect(readingTime("あ".repeat(1200))).toBe(3);
  });

  test("ひらがな・カタカナも CJK に含まれる", () => {
    // ひらがな \u3040-\u309f + カタカナ \u30a0-\u30ff
    const hiragana = "あいうえお".repeat(80); // 400 文字
    const katakana = "アイウエオ".repeat(80); // 400 文字
    expect(readingTime(hiragana)).toBe(1);
    expect(readingTime(katakana)).toBe(1);
  });

  test("漢字（CJK Unified Ideographs）も日本語モードで計算される", () => {
    const kanji = "日本語".repeat(134); // 402 文字
    // readingTime は cjkChars / 500 + enWords / 200 で計算する（500字/分）
    expect(readingTime(kanji)).toBe(Math.ceil(402 / 500));
  });
});

test.describe("readingTime — 英語モード (CJK ≤ 30%)", () => {
  test("200 語の英語は 1 分", () => {
    const words = Array.from({ length: 200 }, () => "word").join(" ");
    expect(readingTime(words)).toBe(1);
  });

  test("400 語の英語は 2 分", () => {
    const words = Array.from({ length: 400 }, () => "word").join(" ");
    expect(readingTime(words)).toBe(2);
  });

  test("1 語の英語は最低 1 分", () => {
    expect(readingTime("hello")).toBe(1);
  });

  test("CJK が 30% 以下なら英語モード", () => {
    // CJK 30 文字 + ASCII 70 文字 → cjk/total = 30/100 = 0.30 → NOT > 0.3 → 英語モード
    const text = "あ".repeat(30) + "a".repeat(70);
    const cjkRatio = 30 / text.length;
    expect(cjkRatio).toBeLessThanOrEqual(0.3);
    // 英語モード: words = "あ...あaaa...a".split(/\s+/) = 1 単語 → ceil(1/200) = 1
    expect(readingTime(text)).toBe(1);
  });

  test("CJK が 31% 以上なら日本語モード", () => {
    // CJK 31 文字 + ASCII 69 文字 → cjk/total = 31/100 = 0.31 > 0.3 → 日本語モード
    const text = "あ".repeat(31) + "a".repeat(69);
    // 日本語モード: ceil(100/400) = 1
    expect(readingTime(text)).toBe(1);
  });

  test("英語の長文は正しい分数を返す", () => {
    // 600 語 → ceil(600/200) = 3
    const words = Array.from({ length: 600 }, () => "word").join(" ");
    expect(readingTime(words)).toBe(3);
  });
});

test.describe("readingTime — HTML タグ除去の正確さ", () => {
  test("<p> タグを除去して文字数を計算する", () => {
    const content = "<p>" + "あ".repeat(400) + "</p>";
    expect(readingTime(content)).toBe(1);
  });

  test("ネストした HTML タグを除去する", () => {
    // <article><h1>...</h1><p>本文</p></article>
    const content = `<article><h1>${"あ".repeat(10)}</h1><p>${"あ".repeat(390)}</p></article>`;
    // タグ除去後 = 400 CJK 文字
    expect(readingTime(content)).toBe(1);
  });

  test("複数の <p> タグにまたがるテキストを合算する", () => {
    const para = "<p>" + "word ".repeat(100) + "</p>";
    // 4 段落 = 400 語 → ceil(400/200) = 2
    expect(readingTime(para.repeat(4))).toBe(2);
  });
});

// ==========================================================================
// timeAgo のテスト
// ==========================================================================

/**
 * timeAgo の単体テスト。
 *
 * 内部で Date.now() を使用するため、テスト時刻からの相対的な
 * ISO 文字列を動的に生成してテストする。
 */

test.describe("timeAgo — 特殊入力", () => {
  test("null は空文字列を返す", () => {
    expect(timeAgo(null)).toBe("");
  });

  test("未来の日時（時計のズレ等）は「たった今」を返す", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(timeAgo(future)).toBe("たった今");
  });

  test("不正な日付文字列は空文字列を返す（Invalid Date 表示を防ぐ）", () => {
    expect(timeAgo("not-a-date")).toBe("");
    expect(timeAgo("")).toBe("");
    expect(timeAgo("2026-13-45T99:99:99Z")).toBe("");
  });
});

test.describe("timeAgo — たった今（1 分未満）", () => {
  test("30 秒前は「たった今」を返す", () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(timeAgo(iso)).toBe("たった今");
  });

  test("59 秒前は「たった今」を返す", () => {
    const iso = new Date(Date.now() - 59_000).toISOString();
    expect(timeAgo(iso)).toBe("たった今");
  });
});

test.describe("timeAgo — 〇分前（1 時間未満）", () => {
  test("1 分前は「1分前」を返す", () => {
    const iso = new Date(Date.now() - 60_000).toISOString();
    expect(timeAgo(iso)).toBe("1分前");
  });

  test("5 分前は「5分前」を返す", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("5分前");
  });

  test("59 分前は「59分前」を返す", () => {
    const iso = new Date(Date.now() - 59 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("59分前");
  });
});

test.describe("timeAgo — 〇時間前（24 時間未満）", () => {
  test("1 時間前は「1時間前」を返す", () => {
    const iso = new Date(Date.now() - 60 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("1時間前");
  });

  test("6 時間前は「6時間前」を返す", () => {
    const iso = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("6時間前");
  });

  test("23 時間前は「23時間前」を返す", () => {
    const iso = new Date(Date.now() - 23 * 60 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("23時間前");
  });
});

test.describe("timeAgo — 〇日前（7 日未満）", () => {
  test("1 日前は「1日前」を返す", () => {
    const iso = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("1日前");
  });

  test("3 日前は「3日前」を返す", () => {
    const iso = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("3日前");
  });

  test("6 日前は「6日前」を返す", () => {
    const iso = new Date(Date.now() - 6 * 24 * 60 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("6日前");
  });
});

test.describe("timeAgo — M月D日形式（7 日以上・同年）", () => {
  test("7 日以上前（同年）は「M月D日」形式を返す", () => {
    // 同年かつ 8 日前になるよう今年 1 月 1 日を基準に計算
    const now = new Date();
    // 同年内に収まるよう 8 日前（2 月以降なら確実に同年）
    const date = new Date(Date.now() - 8 * 24 * 60 * 60_000);
    if (date.getFullYear() !== now.getFullYear()) return; // 年をまたぐ場合はスキップ
    const iso = date.toISOString();
    const expected = date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    expect(timeAgo(iso)).toBe(expected);
  });

  test("30 日前（同年）は「M月D日」形式を返す", () => {
    const now = new Date();
    const date = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    if (date.getFullYear() !== now.getFullYear()) return; // 年をまたぐ場合はスキップ
    const iso = date.toISOString();
    const expected = date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    expect(timeAgo(iso)).toBe(expected);
  });
});

test.describe("timeAgo — YYYY年M月D日形式（異なる年）", () => {
  test("異なる年の日付は「YYYY年M月D日」形式を返す", () => {
    // 確実に異なる年になるよう 400 日前を使用
    const date = new Date(Date.now() - 400 * 24 * 60 * 60_000);
    const iso = date.toISOString();
    const expected = date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    expect(timeAgo(iso)).toBe(expected);
  });

  test("2 年以上前の日付も「YYYY年M月D日」形式を返す", () => {
    const date = new Date(Date.now() - 800 * 24 * 60 * 60_000);
    const iso = date.toISOString();
    const expected = date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    expect(timeAgo(iso)).toBe(expected);
  });

  test("固定日付（2023年6月15日）は年付きで返す", () => {
    const iso = "2023-06-15T12:00:00Z";
    const result = timeAgo(iso);
    // 2023 年は現在（2026 年）と異なるため年が含まれる
    expect(result).toContain("2023");
    expect(result).toContain("6");
  });
});

test.describe("createReadingTimeCache (#685)", () => {
  test("初回呼出は readingTime を実行し値を返す", () => {
    const cache = createReadingTimeCache();
    const article = makeArticle("a1", "<p>" + "あ".repeat(500) + "</p>");
    const mins = cache(article);
    expect(mins).toBeGreaterThanOrEqual(1);
  });

  test("同じ article.id で 2 回目以降は同じ値を返す (キャッシュヒット)", () => {
    const cache = createReadingTimeCache();
    const article = makeArticle("a1", "<p>テスト記事</p>");
    const first = cache(article);
    const second = cache(article);
    expect(second).toBe(first);
  });

  test("article.id が違えば別計算する (新エントリ追加)", () => {
    const cache = createReadingTimeCache();
    const a = makeArticle("a1", "<p>" + "あ".repeat(100) + "</p>");
    const b = makeArticle("a2", "<p>" + "い".repeat(2000) + "</p>");
    const aMins = cache(a);
    const bMins = cache(b);
    expect(bMins).toBeGreaterThan(aMins);
  });

  test("content が undefined / 空でも安全に 0 (or 1 の最小値) を返す", () => {
    const cache = createReadingTimeCache();
    const empty = makeArticle("e1", "");
    const result = cache(empty);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test("content が undefined のとき summary を fallback に使う", () => {
    const cache = createReadingTimeCache();
    const article: Article = {
      id: "s1",
      feedHash: "h",
      guid: "s1",
      title: "t",
      link: "https://example.com/s1",
      summary: "<p>" + "あ".repeat(500) + "</p>",
      publishedAt: "2026-05-01T00:00:00Z",
      createdAt: "2026-05-01T00:00:00Z",
      // content 省略
    };
    const mins = cache(article);
    expect(mins).toBeGreaterThanOrEqual(1);
  });

  test("新しい cache インスタンスは独立 (グローバルキャッシュではない)", () => {
    const a = makeArticle("a1", "<p>" + "あ".repeat(500) + "</p>");
    const cache1 = createReadingTimeCache();
    const cache2 = createReadingTimeCache();
    cache1(a);
    // cache2 は cache1 の内部 Map と独立 — 同じ計算をしても両者の挙動は同じだが内部状態は別
    const mins2 = cache2(a);
    const mins1 = cache1(a);
    expect(mins1).toBe(mins2);
  });

  test("同 cache で 100 件異なる id を投入してもエラーなく動作 (上限なし)", () => {
    const cache = createReadingTimeCache();
    for (let i = 0; i < 100; i++) {
      const article = makeArticle(`bulk-${i}`, `<p>記事 ${i}</p>`);
      cache(article);
    }
    // 再度全件アクセスしてエラー出ない
    for (let i = 0; i < 100; i++) {
      const article = makeArticle(`bulk-${i}`, `<p>記事 ${i}</p>`);
      expect(typeof cache(article)).toBe("number");
    }
  });
});

/**
 * compareByDateDesc / compareByPublishedAtDesc の単体テスト。
 *
 * 2 関数は名前と引数の型が似ているが「null publishedAt の扱い」と「id stable sort 有無」で
 * 意図的に挙動が異なる。両者の差異を spec で明文化することで、将来「両者を統合しよう」
 * のような誤ったリファクタを防ぐ + cron / shared-feed.ts / useArticleData.ts の
 * sort 経路で齟齬が起きないことを保証する。
 *
 * 仕様:
 * - compareByDateDesc: `publishedAt ?? createdAt` (null は createdAt フォールバック)
 *   + 同日付なら id で stable sort
 * - compareByPublishedAtDesc: `publishedAt ?? ""` (null は空文字 → 結果として末尾)
 *   + id 比較なし (= 同 publishedAt は順序維持)
 */

test.describe("compareByDateDesc — publishedAt + createdAt フォールバック + id stable sort", () => {
  test("両方 publishedAt あり: 新しい方が前", () => {
    const a = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "2026-05-10T00:00:00Z" };
    const b = { publishedAt: "2026-05-09T00:00:00Z", createdAt: "2026-05-09T00:00:00Z" };
    expect(compareByDateDesc(a, b)).toBe(-1); // a が前
    expect(compareByDateDesc(b, a)).toBe(1);
  });

  test("publishedAt が null: createdAt にフォールバック", () => {
    const a = { publishedAt: null, createdAt: "2026-05-10T00:00:00Z" };
    const b = { publishedAt: null, createdAt: "2026-05-09T00:00:00Z" };
    expect(compareByDateDesc(a, b)).toBe(-1);
  });

  test("片方 publishedAt あり / 片方 null: それぞれの基準日で比較", () => {
    const a = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "2020-01-01T00:00:00Z" };
    const b = { publishedAt: null, createdAt: "2026-05-09T00:00:00Z" };
    // a は publishedAt 2026-05-10、b は createdAt 2026-05-09 → a が前
    expect(compareByDateDesc(a, b)).toBe(-1);
  });

  test("同日付で id あり: id 昇順で stable sort", () => {
    const a = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "id-aaa" };
    const b = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "id-bbb" };
    expect(compareByDateDesc(a, b)).toBe(-1); // id-aaa < id-bbb なので a が前
    expect(compareByDateDesc(b, a)).toBe(1);
  });

  test("同日付 + 同 id: 0 を返す", () => {
    const a = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "same" };
    const b = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "same" };
    expect(compareByDateDesc(a, b)).toBe(0);
  });

  test("同日付で id 欠落: 0 を返す (順序維持)", () => {
    const a = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x" };
    const b = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x" };
    expect(compareByDateDesc(a, b)).toBe(0);
  });

  test("配列ソート: 全要素のパターンで降順 + id stable sort される", () => {
    const arr = [
      { publishedAt: "2026-05-08T00:00:00Z", createdAt: "x", id: "c" },
      { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "b" },
      { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "a" },
      { publishedAt: null, createdAt: "2026-05-09T00:00:00Z", id: "d" },
    ];
    arr.sort(compareByDateDesc);
    expect(arr.map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
    // 2026-05-10 (a < b) → 2026-05-09 (d, fallback) → 2026-05-08 (c)
  });
});

test.describe("compareByPublishedAtDesc — publishedAt のみ / null は末尾 / id 無視", () => {
  test("両方 publishedAt あり: 新しい方が前", () => {
    const a = { publishedAt: "2026-05-10T00:00:00Z" };
    const b = { publishedAt: "2026-05-09T00:00:00Z" };
    expect(compareByPublishedAtDesc(a, b)).toBe(-1);
    expect(compareByPublishedAtDesc(b, a)).toBe(1);
  });

  test("片方 null: null は末尾 (空文字フォールバック → 全 ISO 文字列より小)", () => {
    const a = { publishedAt: null };
    const b = { publishedAt: "2026-05-09T00:00:00Z" };
    expect(compareByPublishedAtDesc(a, b)).toBe(1); // b が前 → a (null) 末尾
    expect(compareByPublishedAtDesc(b, a)).toBe(-1);
  });

  test("両方 null: 0 を返す (順序維持)", () => {
    const a = { publishedAt: null };
    const b = { publishedAt: null };
    expect(compareByPublishedAtDesc(a, b)).toBe(0);
  });

  test("同 publishedAt: 0 を返す (id 比較なし)", () => {
    // compareByDateDesc と違い id 比較は行わない
    const a = { publishedAt: "2026-05-10T00:00:00Z" };
    const b = { publishedAt: "2026-05-10T00:00:00Z" };
    expect(compareByPublishedAtDesc(a, b)).toBe(0);
  });

  test("配列ソート: null は末尾に集約される", () => {
    const arr = [
      { publishedAt: null, key: "a" },
      { publishedAt: "2026-05-10T00:00:00Z", key: "b" },
      { publishedAt: null, key: "c" },
      { publishedAt: "2026-05-09T00:00:00Z", key: "d" },
    ];
    arr.sort(compareByPublishedAtDesc);
    // 新しい順 (b, d) → null 群 (a, c は順序維持)
    expect(arr[0].key).toBe("b");
    expect(arr[1].key).toBe("d");
    expect(new Set([arr[2].key, arr[3].key])).toEqual(new Set(["a", "c"]));
  });
});

test.describe("compareByDateDesc vs compareByPublishedAtDesc — 仕様差分の明文化", () => {
  test("同 publishedAt の扱い: ByDate は id で stable / ByPublishedAt は順序維持", () => {
    const a = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "z" };
    const b = { publishedAt: "2026-05-10T00:00:00Z", createdAt: "x", id: "a" };
    // ByDate は id で z > a なので b が前 (= -1 を返さず +1)
    expect(compareByDateDesc(a, b)).toBe(1);
    // ByPublishedAt は同 publishedAt なら 0
    expect(compareByPublishedAtDesc(a, b)).toBe(0);
  });

  test("publishedAt: null の扱い: ByDate は createdAt fallback / ByPublishedAt は末尾", () => {
    const newCreated = { publishedAt: null, createdAt: "2026-05-10T00:00:00Z" };
    const oldPublished = { publishedAt: "2020-01-01T00:00:00Z", createdAt: "x" };
    // ByDate: newCreated の createdAt (2026) は oldPublished (2020) より新しい → newCreated が前
    expect(compareByDateDesc(newCreated, oldPublished)).toBe(-1);
    // ByPublishedAt: null は "" → "" < "2020..." → oldPublished が前
    expect(compareByPublishedAtDesc(newCreated, oldPublished)).toBe(1);
  });
});

/**
 * getArticleTimestamp — 記事の代表タイムスタンプ fallback chain (#1063)。
 * isArticleRead / pruneOldReadIds / filterExpiredArticles / compareByDateDesc が共有する
 * `publishedAt ?? createdAt` を集約した純粋関数。
 */
test.describe("getArticleTimestamp — publishedAt ?? createdAt fallback", () => {
  test("publishedAt があれば publishedAt を返す", () => {
    expect(
      getArticleTimestamp({
        publishedAt: "2026-05-01T00:00:00Z",
        createdAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe("2026-05-01T00:00:00Z");
  });

  test("publishedAt が null なら createdAt にフォールバックする", () => {
    expect(getArticleTimestamp({ publishedAt: null, createdAt: "2026-01-01T00:00:00Z" })).toBe(
      "2026-01-01T00:00:00Z",
    );
  });

  test("publishedAt が空文字列なら createdAt でなく空文字列を返す (?? は null/undefined のみ fallback)", () => {
    expect(getArticleTimestamp({ publishedAt: "", createdAt: "2026-01-01T00:00:00Z" })).toBe("");
  });
});
