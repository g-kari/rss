import { test, expect } from "@playwright/test";
import {
  isSummarizerApiSupported,
  shouldUseBrowserSummarizer,
  diagnoseSummarizerAvailability,
  summarizeInBrowser,
  parseChromeMajorVersion,
  MIN_SUMMARIZER_CHROME_VERSION,
  SUMMARIZER_OPTIONS,
} from "../src/lib/browser-summarizer";

/**
 * Chrome Summarizer API ラッパーの純粋関数テスト。
 *
 * Node 実行では `self` / `Summarizer` は存在しないため、
 * `isSummarizerApiSupported` は常に false を返す。
 * 実ブラウザでの動作は E2E 側で確認する。
 */

// ==========================================================================
// isSummarizerApiSupported — Node 環境
// ==========================================================================

test.describe("isSummarizerApiSupported — Node 環境", () => {
  test("Summarizer が無い Node 環境では false", () => {
    // Node.js では `self` が未定義のため false
    expect(isSummarizerApiSupported()).toBe(false);
  });
});

// ==========================================================================
// shouldUseBrowserSummarizer — availability 判定
// ==========================================================================

test.describe("shouldUseBrowserSummarizer — availability 判定", () => {
  test("available は要約可", () => {
    expect(shouldUseBrowserSummarizer("available")).toBe(true);
  });

  test("downloadable は要約可（create() が自動DL）", () => {
    expect(shouldUseBrowserSummarizer("downloadable")).toBe(true);
  });

  test("downloading 中はフォールバック対象", () => {
    expect(shouldUseBrowserSummarizer("downloading")).toBe(false);
  });

  test("unavailable はフォールバック対象", () => {
    expect(shouldUseBrowserSummarizer("unavailable")).toBe(false);
  });
});

// ==========================================================================
// parseChromeMajorVersion — UA 解析の純粋関数
// ==========================================================================

test.describe("parseChromeMajorVersion — UA 文字列解析", () => {
  test("通常の Chrome UA からメジャーバージョンを抽出", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7390.55 Safari/537.36";
    expect(parseChromeMajorVersion(ua)).toBe(142);
  });

  test("Edge (Chromium ベース) でも Chrome/N が返る", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
    expect(parseChromeMajorVersion(ua)).toBe(138);
  });

  test("Safari の UA は null", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(parseChromeMajorVersion(ua)).toBeNull();
  });

  test("空文字 / 不正値は null", () => {
    expect(parseChromeMajorVersion("")).toBeNull();
    expect(parseChromeMajorVersion("not-a-ua-string")).toBeNull();
  });
});

// ==========================================================================
// MIN_SUMMARIZER_CHROME_VERSION — 公式仕様準拠（138+）
// ==========================================================================

test.describe("MIN_SUMMARIZER_CHROME_VERSION — 仕様整合性", () => {
  test("最低バージョンは 138（Summarizer API stable リリース）", () => {
    // 公式: https://developer.chrome.com/docs/ai/summarizer-api
    // Chrome 138 で stable origin trial 終了 → 一般提供
    expect(MIN_SUMMARIZER_CHROME_VERSION).toBe(138);
  });
});

// ==========================================================================
// diagnoseSummarizerAvailability — Node 環境（API 未実装）
// ==========================================================================

test.describe("diagnoseSummarizerAvailability — Node 環境", () => {
  test("Summarizer が無い環境では available=false を返す", async () => {
    const result = await diagnoseSummarizerAvailability();
    expect(result.available).toBe(false);
  });

  test("Summarizer が無い環境では reason が null でない", async () => {
    const result = await diagnoseSummarizerAvailability();
    expect(result.reason).not.toBeNull();
  });

  test("Node.js 環境では有効な reason を返す", async () => {
    const result = await diagnoseSummarizerAvailability();
    // Node.js: navigator.userAgent に Chrome が無い → not-chromium
    // または Chrome あり & Summarizer なし → flag-disabled / chrome-too-old
    const validReasons: Array<string> = [
      "not-chromium",
      "chrome-too-old",
      "flag-disabled",
      "model-downloading",
      "model-unavailable",
      "requires-user-activation",
    ];
    expect(validReasons).toContain(result.reason);
  });
});

// ==========================================================================
// SUMMARIZER_OPTIONS — Chrome 公式仕様準拠の enum 値
// ==========================================================================

test.describe("SUMMARIZER_OPTIONS — Chrome 公式仕様準拠", () => {
  // 公式: https://developer.chrome.com/docs/ai/summarizer-api
  // type の有効値: "key-points" (default) / "tldr" / "teaser" / "headline"
  // ❗ "tl;dr" (セミコロン入り) は無効値で availability() が "unavailable" を返す
  test("type は公式仕様の 'tldr' (セミコロン無し) — Issue #664 対策", () => {
    expect(SUMMARIZER_OPTIONS.type).toBe("tldr");
  });

  test("type に 'tl;dr' (セミコロン入り) を含めない — Chrome の availability() が unavailable を返す原因", () => {
    expect(SUMMARIZER_OPTIONS.type).not.toBe("tl;dr");
  });

  test("length は公式仕様の許可値", () => {
    expect(["short", "medium", "long"]).toContain(SUMMARIZER_OPTIONS.length);
  });

  // #664: Chrome が "No output language was specified" 警告を出さないようにする
  // 公式サポート言語は [en, es, ja] のみ。本プロジェクトは日本語 RSS リーダーなので "ja" 固定。
  test("outputLanguage は公式サポート言語 (en/es/ja) のいずれか — Issue #664", () => {
    expect(["en", "es", "ja"]).toContain(SUMMARIZER_OPTIONS.outputLanguage);
  });

  test("outputLanguage は日本語 RSS リーダーなので 'ja' 固定 — Issue #664", () => {
    expect(SUMMARIZER_OPTIONS.outputLanguage).toBe("ja");
  });

  test("expectedInputLanguages はモデル選択精度向上のヒント — Issue #664", () => {
    expect(Array.isArray(SUMMARIZER_OPTIONS.expectedInputLanguages)).toBe(true);
    expect(SUMMARIZER_OPTIONS.expectedInputLanguages.length).toBeGreaterThan(0);
    // 日本語 + 英語の RSS が大半なので両方をヒントとして含める
    expect(SUMMARIZER_OPTIONS.expectedInputLanguages).toContain("ja");
    expect(SUMMARIZER_OPTIONS.expectedInputLanguages).toContain("en");
  });
});

// ==========================================================================
// summarizeInBrowser — Node 環境
// ==========================================================================

test.describe("summarizeInBrowser — Node 環境", () => {
  test("API が無い Node 環境では null を返す", async () => {
    const result = await summarizeInBrowser("some article text");
    expect(result).toBeNull();
  });

  test("空文字でも null を返す（API 非対応）", async () => {
    const result = await summarizeInBrowser("");
    expect(result).toBeNull();
  });
});
