"use client";

import { useRef, useState } from "react";
import type { SaveArticleUrlHandler, SaveArticleUrlMode } from "./useSaveArticleUrl";

/** Sidebar保存フォーム。閉じたフォームの応答は新しい入力/待機状態へ適用しない。 */
export function useSaveUrlDialog(saveArticle: SaveArticleUrlHandler) {
  const [url, setUrl] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef({ generation: 0, open: false, pending: false });

  function open() {
    sessionRef.current = {
      generation: sessionRef.current.generation + 1,
      open: true,
      pending: false,
    };
    setUrl("");
    setError(null);
    setSaving(false);
    setIsOpen(true);
  }
  function close() {
    sessionRef.current = {
      generation: sessionRef.current.generation + 1,
      open: false,
      pending: false,
    };
    setIsOpen(false);
    setUrl("");
    setError(null);
    setSaving(false);
  }
  function onUrlChange(value: string) {
    if (sessionRef.current.pending) return;
    setUrl(value);
    setError(null);
  }
  async function onSave(mode: SaveArticleUrlMode): Promise<void> {
    const session = sessionRef.current;
    if (!session.open || session.pending || !url.trim()) return;
    session.pending = true;
    setError(null);
    setSaving(true);
    try {
      const result = await saveArticle(url.trim(), mode);
      if (sessionRef.current !== session) return;
      if (result.ok) close();
      else setError(result.error);
    } catch (err) {
      if (sessionRef.current === session) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
      }
    } finally {
      if (sessionRef.current === session) {
        session.pending = false;
        setSaving(false);
      }
    }
  }
  return { url, isOpen, saving, error, open, close, onUrlChange, onSave };
}
