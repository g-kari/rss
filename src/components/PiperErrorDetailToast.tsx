"use client";

import { useEffect, useRef, useState } from "react";
import { useTtsAdapter } from "../contexts/TtsAdapterContext";
import { devError } from "../lib/dev-log";

/**
 * TTS エラー詳細を floating toast で表示するコンポーネント。
 *
 * スマホでは DevTools が開けないため `console.error` を見られない。`TtsAdapter.lastErrorDetail`
 * を購読して engine / voice / model / code / message を画面上に直接表示し、「コピー」ボタンで
 * Issue 提出用のクリップボード保存も提供する。
 *
 * 表示トリガー: `errorCount` の monotonic increment (`prev → current` の差分検知)。
 * Web Speech / Piper 両 engine で動作する (engine 種別は detail.engine で区別)。
 *
 * UX:
 * - 右下 `fixed bottom-20 right-4` (PiperInitProgressToast の下、ToastContainer の上)
 * - close ボタンで明示的に閉じる (TTS error は重要なので auto fade out なし)
 * - 「コピー」ボタンでクリップボードに整形済みテキストを保存 → コピー成功で 2 秒間ラベル変化
 */
export default function PiperErrorDetailToast() {
  const { errorCount, lastErrorDetail } = useTtsAdapter();
  const [visible, setVisible] = useState(false);
  const [copyLabel, setCopyLabel] = useState<"コピー" | "コピー済 ✓" | "失敗">("コピー");
  const prevErrorCountRef = useRef(errorCount);

  // errorCount 増加で表示。同じ errorCount 値で再表示しない (ユーザーが閉じたら次のエラーまで沈黙)。
  useEffect(() => {
    if (errorCount > prevErrorCountRef.current) {
      prevErrorCountRef.current = errorCount;
      setVisible(true);
    }
  }, [errorCount]);

  if (!visible || !lastErrorDetail) return null;

  const detail = lastErrorDetail;
  const copyText = [
    `[TTS error]`,
    `engine: ${detail.engine}`,
    `code: ${detail.code}`,
    `message: ${detail.message}`,
    detail.name ? `name: ${detail.name}` : null,
    detail.voiceUri ? `voiceUri: ${detail.voiceUri}` : null,
    detail.model ? `model: ${detail.model}` : null,
    `occurredAt: ${detail.occurredAt}`,
    `userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "(unknown)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const handleCopy = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("clipboard API unavailable");
      }
      await navigator.clipboard.writeText(copyText);
      setCopyLabel("コピー済 ✓");
      setTimeout(() => setCopyLabel("コピー"), 2000);
    } catch (err) {
      devError("[PiperErrorDetailToast] clipboard copy failed", err);
      setCopyLabel("失敗");
      setTimeout(() => setCopyLabel("コピー"), 2000);
    }
  };

  const handleClose = () => {
    setVisible(false);
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-20 right-4 z-50 max-w-md w-[22rem] bg-surface-elevated border border-error rounded-lg shadow-lg p-4 flex flex-col gap-2"
    >
      <div className="flex items-start gap-2">
        <span className="text-[12px] font-medium text-error shrink-0">⚠ TTS エラー</span>
        <span className="text-[11px] text-text-muted tabular-nums ml-auto shrink-0">
          {detail.engine}
        </span>
        <button
          type="button"
          onClick={handleClose}
          className="text-[14px] leading-none text-text-muted hover:text-text-strong px-1"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
        <dt className="text-text-muted">code:</dt>
        <dd className="text-text-strong font-mono break-all">{detail.code}</dd>
        <dt className="text-text-muted">message:</dt>
        <dd className="text-text-soft font-mono break-all">{detail.message}</dd>
        {detail.name && (
          <>
            <dt className="text-text-muted">name:</dt>
            <dd className="text-text-soft font-mono break-all">{detail.name}</dd>
          </>
        )}
        {detail.voiceUri && (
          <>
            <dt className="text-text-muted">voice:</dt>
            <dd className="text-text-soft font-mono break-all">{detail.voiceUri}</dd>
          </>
        )}
        {detail.model && (
          <>
            <dt className="text-text-muted">model:</dt>
            <dd className="text-text-soft font-mono break-all">{detail.model}</dd>
          </>
        )}
      </dl>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-1 self-end text-[11px] px-3 py-1 rounded-md bg-ink text-ink-text hover:bg-ink-hover transition-all duration-200"
      >
        {copyLabel}
      </button>
    </div>
  );
}
