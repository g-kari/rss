"use client";

import { useCallback, useEffect, useState } from "react";
import type { Article } from "../types";

interface UseArticleNoteParams {
  article: Article | null;
  note: string | undefined;
  onSetNote?: (articleId: string, text: string) => void;
  onDeleteNote?: (articleId: string) => void;
}

interface UseArticleNoteResult {
  noteText: string;
  setNoteText: (text: string) => void;
  noteExpanded: boolean;
  setNoteExpanded: (expanded: boolean) => void;
  handleNoteBlur: () => void;
}

/**
 * 記事メモ編集ステートを管理する。
 * - 記事切り替え時に props.note から初期化（保存後の prop 更新では上書きしない）
 * - blur 時に差分を検知し、空なら削除、そうでなければ保存
 */
export function useArticleNote({
  article,
  note,
  onSetNote,
  onDeleteNote,
}: UseArticleNoteParams): UseArticleNoteResult {
  const [noteText, setNoteText] = useState(note ?? "");
  const [noteExpanded, setNoteExpanded] = useState(!!note);

  useEffect(() => {
    setNoteText(note ?? "");
    setNoteExpanded(!!note);
    // note は deps から除外 — 記事切り替え時のみリセットし、保存後の prop 更新では上書きしない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  const handleNoteBlur = useCallback(() => {
    if (!article || !onSetNote) return;
    const trimmed = noteText.trim();
    const current = note ?? "";
    if (trimmed === current) return;
    if (trimmed === "") {
      onDeleteNote?.(article.id);
    } else {
      onSetNote(article.id, trimmed);
    }
  }, [article, note, noteText, onDeleteNote, onSetNote]);

  return { noteText, setNoteText, noteExpanded, setNoteExpanded, handleNoteBlur };
}
