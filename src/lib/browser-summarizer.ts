/**
 * Chrome 138+ の組み込み Summarizer API ラッパー。
 *
 * 利用できる環境ではブラウザ側で要約を完結させ、Workers AI コスト・レイテンシを削減する。
 * 非対応（Safari / Firefox / 古い Chrome）では呼び出し側が従来の Workers AI にフォールバックする。
 *
 * 仕様: https://developer.chrome.com/docs/ai/summarizer-api
 */

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

interface BrowserSummarizer {
  summarize(text: string): Promise<string>;
}

interface BrowserSummarizerConstructor {
  availability(options?: {
    type?: "headline" | "tl;dr" | "teaser" | "key-points";
    length?: "short" | "medium" | "long";
  }): Promise<Availability>;
  create(options?: {
    type?: "headline" | "tl;dr" | "teaser" | "key-points";
    length?: "short" | "medium" | "long";
    sharedContext?: string;
  }): Promise<BrowserSummarizer>;
}

// Chrome の公式検出パターン `'Summarizer' in self` に合わせ globalThis への宣言とする
declare global {
  var Summarizer: BrowserSummarizerConstructor | undefined;
}

export function isSummarizerApiSupported(): boolean {
  return typeof self !== "undefined" && "Summarizer" in self;
}

function shouldUseBrowserSummarizer(availability: Availability): boolean {
  return availability === "available" || availability === "downloadable";
}

export type SummarizerUnavailableReason = "not-chromium" | "flag-disabled" | "not-available" | null;

export async function diagnoseSummarizerAvailability(): Promise<{
  available: boolean;
  reason: SummarizerUnavailableReason;
}> {
  if (typeof self === "undefined" || !("Summarizer" in self)) {
    const isChromiumBased =
      typeof navigator !== "undefined" && /Chrome\//.test(navigator.userAgent);
    if (isChromiumBased) return { available: false, reason: "flag-disabled" };
    return { available: false, reason: "not-chromium" };
  }
  try {
    const availability = await globalThis.Summarizer!.availability({
      type: "tl;dr",
      length: "medium",
    });
    if (shouldUseBrowserSummarizer(availability)) return { available: true, reason: null };
    return { available: false, reason: "not-available" };
  } catch {
    return { available: false, reason: "not-available" };
  }
}

export async function summarizeInBrowser(text: string): Promise<string | null> {
  if (!isSummarizerApiSupported() || !globalThis.Summarizer) return null;

  try {
    const availability = await globalThis.Summarizer.availability({
      type: "tl;dr",
      length: "medium",
    });
    if (!shouldUseBrowserSummarizer(availability)) return null;

    const summarizer = await globalThis.Summarizer.create({
      type: "tl;dr",
      length: "medium",
      sharedContext: "RSS feed article summary",
    });
    return await summarizer.summarize(text);
  } catch {
    return null;
  }
}
