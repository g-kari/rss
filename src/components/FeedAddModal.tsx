"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import Modal from "./Modal";
import { isAbsoluteHttpUrl } from "../lib/url";

const PROGRESS_STEPS = [
  { at: 0, label: "フィードを確認中..." },
  { at: 2000, label: "RSS フィードを探索中..." },
  { at: 5000, label: "AI でセレクタを推論中...（しばらくお待ちください）" },
] as const;

interface Props {
  url: string;
  onUrlChange: (v: string) => void;
  cookie: string;
  onCookieChange: (v: string) => void;
  cssSelector: string;
  onCssSelectorChange: (v: string) => void;
  cookieOpen: boolean;
  onCookieOpenChange: (v: boolean) => void;
  cssSelectorOpen: boolean;
  onCssSelectorOpenChange: (v: boolean) => void;
  useRsshub: boolean;
  onUseRsshubChange: (v: boolean) => void;
  adding: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

/**
 * フィード追加モーダル。Issue #115 対応でインラインフォームから移行。
 * URL 必須 + Cookie / CSS セレクタは折りたたみで任意指定。
 * Issue #396: 追加中（adding=true）はモーダルを閉じられないようにする。
 * Issue #459: paste & go + リアルタイム URL バリデーション追加。
 */
export default function FeedAddModal({
  url,
  onUrlChange,
  cookie,
  onCookieChange,
  cssSelector,
  onCssSelectorChange,
  cookieOpen,
  onCookieOpenChange,
  cssSelectorOpen,
  onCssSelectorOpenChange,
  useRsshub,
  onUseRsshubChange,
  adding,
  error,
  onSubmit,
  onClose,
}: Props) {
  // Issue #396: 追加処理中はモーダルを閉じられないようにする
  const handleClose = adding ? () => {} : onClose;

  const [progressLabel, setProgressLabel] = useState<string>(PROGRESS_STEPS[0].label);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Issue #459: リアルタイム URL バリデーション状態
  const [urlValid, setUrlValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!adding) {
      setProgressLabel(PROGRESS_STEPS[0].label);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }
    setProgressLabel(PROGRESS_STEPS[0].label);
    timersRef.current = PROGRESS_STEPS.slice(1).map(({ at, label }) =>
      setTimeout(() => setProgressLabel(label), at),
    );
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [adding]);

  function handleUrlChange(value: string) {
    onUrlChange(value);
    if (value === "") {
      setUrlValid(null);
    } else {
      setUrlValid(isAbsoluteHttpUrl(value));
    }
  }

  // Issue #459: paste & go — ペースト直後に値を取得して有効な URL なら自動送信
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    setTimeout(() => {
      if (isAbsoluteHttpUrl(pasted)) {
        onUrlChange(pasted);
        setUrlValid(true);
        const form = e.currentTarget.closest("form");
        if (form) {
          form.requestSubmit();
        }
      }
    }, 0);
  }

  // 追加ボタンのスタイル: URL が有効なら ring でハイライト
  const submitClass = [
    "flex-1 min-h-[44px] text-[12px] tracking-[0.06em] py-3 bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-40",
    urlValid === true && !adding ? "ring-2 ring-offset-1 ring-ink" : "",
  ]
    .join(" ")
    .trim();

  return (
    <Modal title="フィードを追加" onClose={handleClose} width="sm:w-[440px]">
      <div className="p-4">
        <form onSubmit={onSubmit}>
          <div className="relative">
            <label htmlFor="feed-add-url" className="sr-only">
              フィード URL
            </label>
            <input
              id="feed-add-url"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onPaste={handlePaste}
              disabled={adding}
              autoFocus
              aria-required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "feed-add-error" : undefined}
              className={[
                "w-full text-[13px] bg-surface-base border rounded-lg px-3 py-2 text-text-strong placeholder-text-faint outline-none transition-colors duration-200",
                urlValid === false
                  ? "border-rose-400 focus:border-rose-400"
                  : urlValid === true
                    ? "border-text-muted focus:border-text-muted"
                    : "border-border-default focus:border-text-muted",
              ].join(" ")}
            />
            {urlValid === true && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-[12px] pointer-events-none">
                ✓
              </span>
            )}
            {urlValid === false && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-error text-[12px] pointer-events-none">
                ✗
              </span>
            )}
          </div>
          {urlValid === false && (
            <p className="text-[11px] text-error mt-1">有効な http(s) URL を入力してください</p>
          )}

          {/* Cookie オプション（年齢確認ゲート等の突破用） */}
          <button
            type="button"
            onClick={() => onCookieOpenChange(!cookieOpen)}
            className="mt-2 text-[11px] text-text-faint hover:text-text-muted transition-colors duration-200"
            aria-expanded={cookieOpen}
            aria-controls="feed-add-cookie-section"
          >
            {cookieOpen ? "▾ Cookie を隠す" : "▸ Cookie を設定（任意）"}
          </button>
          {cookieOpen && (
            <div id="feed-add-cookie-section">
              <label htmlFor="feed-add-cookie" className="sr-only">
                Cookie
              </label>
              <input
                id="feed-add-cookie"
                type="text"
                placeholder="例: age_check_done=1"
                value={cookie}
                onChange={(e) => onCookieChange(e.target.value)}
                disabled={adding}
                className="mt-1 w-full text-[12px] bg-surface-base border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200 font-mono"
              />
            </div>
          )}

          {/* CSS セレクタ手動指定（RSS なし・LLM 推論失敗時のフォールバック） */}
          <button
            type="button"
            onClick={() => onCssSelectorOpenChange(!cssSelectorOpen)}
            className="mt-2 text-[11px] text-text-faint hover:text-text-muted transition-colors duration-200"
            aria-expanded={cssSelectorOpen}
            aria-controls="feed-add-selector-section"
          >
            {cssSelectorOpen
              ? "▾ CSS セレクタを隠す"
              : "▸ CSS セレクタを指定（RSS のないサイト用）"}
          </button>
          {cssSelectorOpen && (
            <div id="feed-add-selector-section" className="mt-1 space-y-1">
              <label htmlFor="feed-add-css-selector" className="sr-only">
                CSS セレクタ
              </label>
              <input
                id="feed-add-css-selector"
                type="text"
                placeholder="例: ul.news-list li a"
                value={cssSelector}
                onChange={(e) => onCssSelectorChange(e.target.value)}
                disabled={adding}
                className="w-full text-[12px] bg-surface-base border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200 font-mono"
              />
              <p className="text-[11px] text-text-faint">
                記事リンク（&lt;a&gt;タグ）を指すセレクタを入力してください
              </p>
            </div>
          )}

          {/* RSSHub 連携 (Twitter / YouTube / GitHub など RSS のないサイトを自動変換) */}
          <label className="mt-3 flex items-center gap-2 text-[11px] text-text-muted hover:text-text-default cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useRsshub}
              onChange={(e) => onUseRsshubChange(e.target.checked)}
              disabled={adding}
              className="w-3.5 h-3.5 accent-ink cursor-pointer"
            />
            <span>RSSHub で自動変換（Twitter / YouTube / GitHub 等）</span>
          </label>

          {error && (
            <p
              id="feed-add-error"
              role="alert"
              aria-live="assertive"
              className="text-[12px] text-error mt-2"
            >
              {error}
            </p>
          )}

          {adding && (
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-[11px] text-text-muted mt-2 animate-pulse"
            >
              {progressLabel}
            </p>
          )}

          <div className="flex gap-2 mt-3">
            <button type="submit" disabled={adding} className={submitClass}>
              {adding ? "追加中..." : "追加"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={adding}
              className="min-h-[44px] text-[12px] px-4 py-3 text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
