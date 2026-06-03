"use client";

import { useState, type FormEvent } from "react";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";

interface Props {
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => Promise<{ error: string } | void>;
  onClose: () => void;
}

export default function CollectionModal({ mode, initialName = "", onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setError("");
    setSubmitting(true);
    const result = await onSubmit(name.trim());
    setSubmitting(false);
    if (result && "error" in result) {
      setError(result.error);
    } else {
      onClose();
    }
  };

  return (
    <Modal title={mode === "create" ? "コレクション作成" : "コレクション名変更"} onClose={onClose}>
      {/* aria-busy: submitting 中であることをスクリーンリーダーに通知 (SaveUrlModal canonical 同 pattern)。
          submit 中の「dim だけ」では SR で「disabled 中 = 入力不正」と「処理中」が区別できない。 */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4" aria-busy={submitting || undefined}>
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="コレクション名"
            aria-label="コレクション名"
            maxLength={50}
            autoFocus
            aria-required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "collection-name-error" : undefined}
            className="w-full px-3 py-2 text-[13px] bg-surface-base border border-border-default rounded-lg text-text-strong placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-text-muted"
          />
          {error && (
            <p id="collection-name-error" role="alert" className="mt-1 text-[11px] text-error">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          {/* submitting 中の視覚 feedback: dim だけだとボタン押せたか不明、Spinner で進行中を明示
              (canonical: SaveUrlModal / ArticleView / ArticleList でも同 Spinner 使用)。 */}
          {submitting && <Spinner />}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[13px] text-text-default hover:text-text-strong transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="px-3 py-1.5 text-[13px] bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-50"
          >
            {mode === "create" ? "作成" : "変更"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
