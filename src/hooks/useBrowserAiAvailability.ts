"use client";

import { useEffect, useState } from "react";
import { diagnoseSummarizerAvailability } from "../lib/browser-summarizer";
import { diagnoseTranslatorAvailability } from "../lib/browser-translator";

export interface BrowserAiAvailability {
  /** Chrome Translator API が auto-translate に使えるか。null は診断中 */
  translatorAvailable: boolean | null;
  /** Chrome Summarizer API が auto-summarize に使えるか。null は診断中 */
  summarizerAvailable: boolean | null;
}

/**
 * ブラウザネイティブ AI (Chrome Translator / Summarizer) の利用可否を診断する hook (#700)。
 *
 * `diagnoseSummarizerAvailability` / `diagnoseTranslatorAvailability` を mount 時に
 * **1 回だけ** 呼び出して結果を state にキャッシュする。`AiNotificationTabPanel` は同じ診断を
 * 設定モーダル内で呼んでいるが、auto-trigger 側の判定はモーダルが開かれていなくても必要なため
 * 独立した hook として提供する。
 *
 * 注意: 戻り値の `availability` フラグは **mount 時点のスナップショット**。Chrome の
 * モデル DL 完了等で実行中に状態が変わることがあるが、その場合はユーザーが明示的に
 * 設定変更 (= 再 mount) するかページリロードで再診断される設計。
 */
export function useBrowserAiAvailability(): BrowserAiAvailability {
  const [translatorAvailable, setTranslatorAvailable] = useState<boolean | null>(null);
  const [summarizerAvailable, setSummarizerAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    diagnoseTranslatorAvailability().then((diag) => {
      if (!cancelled) setTranslatorAvailable(diag.available);
    });
    diagnoseSummarizerAvailability().then((diag) => {
      if (!cancelled) setSummarizerAvailable(diag.available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { translatorAvailable, summarizerAvailable };
}
