"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

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

  const handleSubmit = async (e: React.FormEvent) => {
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
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="コレクション名"
            maxLength={50}
            autoFocus
            aria-required
            aria-invalid={error ? true : undefined}
            className="w-full px-3 py-2 text-[13px] bg-surface-base border border-border-default rounded-lg text-text-strong placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-text-muted"
          />
          {error && <p className="mt-1 text-[11px] text-rose-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
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
