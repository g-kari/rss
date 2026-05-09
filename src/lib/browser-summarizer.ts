/**
 * Chrome 138+ の組み込み Summarizer API ラッパー。
 *
 * 利用できる環境ではブラウザ側で要約を完結させ、Workers AI コスト・レイテンシを削減する。
 * 非対応（Safari / Firefox / 古い Chrome）では呼び出し側が従来の Workers AI にフォールバックする。
 *
 * 仕様:
 * - https://developer.chrome.com/docs/ai/summarizer-api
 * - https://developer.chrome.com/docs/ai/get-started
 *
 * 公式仕様の要点:
 * - 検出は `'Summarizer' in self`
 * - 状態取得は `Summarizer.availability(options)` (returns: "available" | "downloadable" | "downloading" | "unavailable")
 * - `Summarizer.create()` で初回ダウンロードがトリガーされる場合 `navigator.userActivation.isActive` 必須
 * - ダウンロード進捗は `monitor` コールバックで購読する
 */

import { devError } from "./dev-log";

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

interface BrowserSummarizer {
  summarize(text: string): Promise<string>;
}

interface CreateMonitor {
  addEventListener(
    type: "downloadprogress",
    listener: (event: { loaded: number; total?: number }) => void,
  ): void;
}

interface BrowserSummarizerConstructor {
  availability(options?: {
    type?: "headline" | "tldr" | "teaser" | "key-points";
    length?: "short" | "medium" | "long";
  }): Promise<Availability>;
  create(options?: {
    type?: "headline" | "tldr" | "teaser" | "key-points";
    length?: "short" | "medium" | "long";
    sharedContext?: string;
    monitor?: (m: CreateMonitor) => void;
  }): Promise<BrowserSummarizer>;
}

/**
 * `availability()` / `create()` に渡す共通オプション。
 *
 * ❗ Chrome 公式仕様 (https://developer.chrome.com/docs/ai/summarizer-api) では
 * `type` の有効値は `"key-points" | "tldr" | "teaser" | "headline"` (セミコロン無し)。
 * `"tl;dr"` (セミコロン入り) を渡すと `availability()` が `"unavailable"` を返し、
 * 端末上の要約 API が永久に使えない誤判定になる。
 */
export const SUMMARIZER_OPTIONS = {
  type: "tldr",
  length: "medium",
} as const;

// Chrome の公式検出パターン `'Summarizer' in self` に合わせ globalThis への宣言とする
declare global {
  var Summarizer: BrowserSummarizerConstructor | undefined;
}

/** Summarizer API が stable で利用可能になった最低 Chrome メジャーバージョン (公式: 138)。 */
export const MIN_SUMMARIZER_CHROME_VERSION = 138;

/** UA 文字列から Chrome のメジャーバージョンを抽出する純粋関数。Edge 等の Chromium ベースも対象。 */
export function parseChromeMajorVersion(userAgent: string): number | null {
  const match = /Chrome\/(\d+)/.exec(userAgent);
  return match ? parseInt(match[1], 10) : null;
}

function getChromeVersion(): number | null {
  if (typeof navigator === "undefined") return null;
  return parseChromeMajorVersion(navigator.userAgent);
}

export function isSummarizerApiSupported(): boolean {
  return typeof self !== "undefined" && "Summarizer" in self;
}

export function shouldUseBrowserSummarizer(availability: Availability): boolean {
  return availability === "available" || availability === "downloadable";
}

export type SummarizerUnavailableReason =
  | "not-chromium"
  | "chrome-too-old"
  | "flag-disabled"
  | "model-downloading"
  | "model-unavailable"
  | "requires-user-activation"
  | null;

export async function diagnoseSummarizerAvailability(): Promise<{
  available: boolean;
  reason: SummarizerUnavailableReason;
}> {
  if (typeof self === "undefined" || !("Summarizer" in self)) {
    const isChromiumBased =
      typeof navigator !== "undefined" && /Chrome\//.test(navigator.userAgent);
    if (!isChromiumBased) return { available: false, reason: "not-chromium" };
    const chromeVersion = getChromeVersion();
    if (chromeVersion !== null && chromeVersion < MIN_SUMMARIZER_CHROME_VERSION) {
      return { available: false, reason: "chrome-too-old" };
    }
    return { available: false, reason: "flag-disabled" };
  }
  try {
    const availability = await globalThis.Summarizer!.availability(SUMMARIZER_OPTIONS);
    if (shouldUseBrowserSummarizer(availability)) return { available: true, reason: null };
    if (availability === "downloading") return { available: false, reason: "model-downloading" };
    return { available: false, reason: "model-unavailable" };
  } catch (err) {
    devError("[browser-summarizer] availability() threw", err);
    return { available: false, reason: "model-unavailable" };
  }
}

/** `Summarizer.create()` 呼び出し前の user activation を確認する。 */
function hasUserActivation(): boolean {
  if (typeof navigator === "undefined") return false;
  // navigator.userActivation は Chrome 72+ で利用可能。Summarizer 138+ では必ず存在する。
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua?.isActive === true;
}

export async function summarizeInBrowser(text: string): Promise<string | null> {
  if (!isSummarizerApiSupported() || !globalThis.Summarizer) return null;

  try {
    const availability = await globalThis.Summarizer.availability(SUMMARIZER_OPTIONS);
    if (!shouldUseBrowserSummarizer(availability)) {
      devError("[browser-summarizer] availability not usable:", availability);
      return null;
    }

    // モデル未 DL の場合 create() がダウンロードをトリガーするため user activation が必須。
    // 既に DL 済 (available) の場合は不要だが、安全側に倒して必ず確認する。
    if (availability === "downloadable" && !hasUserActivation()) {
      devError(
        "[browser-summarizer] requires user activation to trigger model download — falling back",
      );
      return null;
    }

    const summarizer = await globalThis.Summarizer.create({
      ...SUMMARIZER_OPTIONS,
      sharedContext: "RSS feed article summary",
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          devError(`[browser-summarizer] download progress: ${Math.round(e.loaded * 100)}%`);
        });
      },
    });
    return await summarizer.summarize(text);
  } catch (err) {
    devError("[browser-summarizer] summarize failed", err);
    return null;
  }
}
