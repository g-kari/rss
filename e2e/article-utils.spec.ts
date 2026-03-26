import { test, expect } from "@playwright/test";
import { readingTime, timeAgo } from "../src/lib/article-utils";

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
    expect(readingTime(kanji)).toBe(Math.ceil(402 / 400));
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

test.describe("timeAgo — M月D日形式（7 日以上）", () => {
  test("7 日以上前は「M月D日」形式を返す", () => {
    const date = new Date(Date.now() - 8 * 24 * 60 * 60_000);
    const iso = date.toISOString();
    const expected = date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    expect(timeAgo(iso)).toBe(expected);
  });

  test("30 日前は「M月D日」形式を返す", () => {
    const date = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const iso = date.toISOString();
    const expected = date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    expect(timeAgo(iso)).toBe(expected);
  });

  test("365 日前は「M月D日」形式を返す", () => {
    const date = new Date(Date.now() - 365 * 24 * 60 * 60_000);
    const iso = date.toISOString();
    const expected = date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    expect(timeAgo(iso)).toBe(expected);
  });
});
