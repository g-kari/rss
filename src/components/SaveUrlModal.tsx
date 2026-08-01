"use client";

import { useRef } from "react";
import Modal from "./Modal";
import Spinner from "./Spinner";

interface Props {
  url: string;
  onUrlChange: (v: string) => void;
  saving: boolean;
  error: string | null;
  onSave: (mode: "bookmark" | "reading_list") => void;
  onClose: () => void;
}

/**
 * URL から記事保存モーダル。Issue #115 対応でインラインフォームから移行。
 * ブックマーク / 後で読む の 2 モードで保存可能。
 */
export default function SaveUrlModal({ url, onUrlChange, saving, error, onSave, onClose }: Props) {
  // Modal focus trap の default 「first focusable = close ボタン」を override して
  // URL input を初期 focus に。WCAG 2.4.3 (Focus Order) 準拠 + キーボードユーザーが
  // 開いた直後に Tab なしで直接 URL 入力できる canonical (ConfirmModal.tsx:45 の cancelRef と同 pattern)。
  const urlInputRef = useRef<HTMLInputElement>(null);
  return (
    <Modal title="URL を保存" onClose={onClose} width="sm:w-[400px]" initialFocusRef={urlInputRef}>
      {/* aria-busy: saving 中であることをスクリーンリーダーに通知 (POST /api/articles/save は 1-3 秒) */}
      <div className="p-4" aria-busy={saving || undefined}>
        <label htmlFor="save-url-input" className="sr-only">
          保存する URL
        </label>
        <input
          ref={urlInputRef}
          id="save-url-input"
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={saving}
          aria-required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "save-url-error" : undefined}
          className="w-full text-[13px] bg-surface-base border border-border-default rounded-lg px-3 py-2 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
        />

        <div className="flex items-center gap-2 mt-3">
          {/* saving 中の視覚 feedback: ボタン dim だけだと 1-3 秒の fetch 中に「押せたか」不明、
              Spinner で「進行中」を明示 (canonical: ArticleView / ArticleList でも同 Spinner 使用) */}
          {saving && <Spinner />}
          <button
            type="button"
            onClick={() => onSave("bookmark")}
            disabled={saving || !url.trim()}
            className="flex-1 min-h-[44px] text-[12px] tracking-[0.04em] py-2 bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-40"
          >
            ブックマーク
          </button>
          <button
            type="button"
            onClick={() => onSave("reading_list")}
            disabled={saving || !url.trim()}
            className="flex-1 min-h-[44px] text-[12px] tracking-[0.04em] py-2 bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-40"
          >
            後で読む
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] text-[12px] px-4 py-2 text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-lg transition-all duration-200"
          >
            キャンセル
          </button>
        </div>

        {error && (
          <p id="save-url-error" role="alert" className="mt-2 text-[12px] text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
