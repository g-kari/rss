"use client";

import Modal from "./Modal";

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
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/**
 * フィード追加モーダル。Issue #115 対応でインラインフォームから移行。
 * URL 必須 + Cookie / CSS セレクタは折りたたみで任意指定。
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
  return (
    <Modal title="フィードを追加" onClose={onClose} width="sm:w-[440px]">
      <div className="p-4">
        <form onSubmit={onSubmit}>
          <input
            type="url"
            inputMode="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={adding}
            autoFocus
            aria-required
            aria-invalid={error ? true : undefined}
            className="w-full text-[13px] bg-surface-base border border-border-default rounded-lg px-3 py-2 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />

          {/* Cookie オプション（年齢確認ゲート等の突破用） */}
          <button
            type="button"
            onClick={() => onCookieOpenChange(!cookieOpen)}
            className="mt-2 text-[11px] text-text-faint hover:text-text-muted transition-colors duration-200"
          >
            {cookieOpen ? "▾ Cookie を隠す" : "▸ Cookie を設定（任意）"}
          </button>
          {cookieOpen && (
            <input
              type="text"
              placeholder="例: age_check_done=1"
              value={cookie}
              onChange={(e) => onCookieChange(e.target.value)}
              disabled={adding}
              className="mt-1 w-full text-[12px] bg-surface-base border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200 font-mono"
            />
          )}

          {/* CSS セレクタ手動指定（RSS なし・LLM 推論失敗時のフォールバック） */}
          <button
            type="button"
            onClick={() => onCssSelectorOpenChange(!cssSelectorOpen)}
            className="mt-2 text-[11px] text-text-faint hover:text-text-muted transition-colors duration-200"
          >
            {cssSelectorOpen
              ? "▾ CSS セレクタを隠す"
              : "▸ CSS セレクタを指定（RSS のないサイト用）"}
          </button>
          {cssSelectorOpen && (
            <div className="mt-1 space-y-1">
              <input
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

          {error && <p className="text-[12px] text-rose-400 mt-2">{error}</p>}

          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              disabled={adding}
              className="flex-1 text-[12px] tracking-[0.06em] py-2 bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-40"
            >
              {adding ? "追加中..." : "追加"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] px-4 py-2 text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-lg transition-all duration-200"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
