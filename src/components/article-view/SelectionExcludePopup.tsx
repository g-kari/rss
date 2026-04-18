import React, { useCallback, useEffect, useState } from "react";
import type { KeywordFilter } from "../../types";
import { usePopupLock } from "../../hooks/usePopupLock";

const MAX_SELECTION_LENGTH = 100;

export interface SelectionPopupState {
  x: number;
  y: number;
  text: string;
}

/** 記事本文エリア内のテキスト選択を検知してポップアップ表示用の状態を返す */
export function useSelectionExclude(containerRef: React.RefObject<HTMLElement | null>) {
  const [popup, setPopup] = useState<SelectionPopupState | null>(null);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function checkSelection() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setPopup(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length > MAX_SELECTION_LENGTH) {
        setPopup(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!containerRef.current?.contains(range.commonAncestorContainer)) {
        setPopup(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPopup({ x: rect.left + rect.width / 2, y: rect.top, text });
    }

    // PC: pointerup で即時評価（debounce をキャンセルして二重発火を防ぐ）
    function handlePointerUp() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      checkSelection();
    }

    // スマホ: 長押し選択ハンドル操作中は pointerup が発火しないため
    // selectionchange をデバウンスして選択確定後に評価する
    function handleSelectionChange() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkSelection, 150);
    }

    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [containerRef]);

  const clearPopup = useCallback(() => {
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return { popup, clearPopup };
}

interface Props {
  popup: SelectionPopupState;
  article: { title: string; link: string };
  globalFilter?: KeywordFilter | null;
  onSaveGlobalFilter?: (filter: KeywordFilter | null) => void;
  showToast?: (msg: string) => void;
  onClose: () => void;
}

export default function SelectionExcludePopup({
  popup,
  article,
  globalFilter,
  onSaveGlobalFilter,
  showToast,
  onClose,
}: Props) {
  usePopupLock();
  const displayText = popup.text.length > 24 ? `${popup.text.slice(0, 24)}…` : popup.text;

  function doCopyQuote(e: { preventDefault: () => void }) {
    e.preventDefault();
    const quote = `> ${popup.text.replace(/\n/g, "\n> ")}\n\n— [${article.title}](${article.link})`;
    navigator.clipboard
      .writeText(quote)
      .then(() => showToast?.("引用をコピーしました"))
      .catch(() => showToast?.("コピーに失敗しました"));
    onClose();
  }

  function doExclude(e: { preventDefault: () => void }) {
    e.preventDefault(); // 選択を維持しつつボタン押下
    const existing = globalFilter?.exclude ?? [];
    if (existing.includes(popup.text)) {
      showToast?.("既にグローバル除外キーワードに登録されています");
    } else {
      onSaveGlobalFilter?.({
        include: globalFilter?.include ?? [],
        exclude: [...existing, popup.text],
        matchCategories: globalFilter?.matchCategories,
      });
      showToast?.(`「${displayText}」をグローバル除外に追加しました`);
    }
    onClose();
  }

  return (
    <div className="fixed z-50 pointer-events-none" style={{ left: popup.x, top: popup.y }}>
      <div className="pointer-events-auto -translate-x-1/2 -translate-y-full mb-2 transform">
        <div className="bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden">
          <button
            onMouseDown={doCopyQuote}
            onTouchEnd={doCopyQuote}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors whitespace-nowrap w-full"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 text-text-muted"
            >
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
            </svg>
            <span>引用をコピー</span>
          </button>
          {onSaveGlobalFilter && (
            <>
              <div className="border-t border-border-subtle" />
              <button
                onMouseDown={doExclude}
                onTouchEnd={doExclude}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors whitespace-nowrap w-full"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0 text-text-muted"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>「{displayText}」を除外</span>
              </button>
            </>
          )}
        </div>
        {/* 吹き出し三角 */}
        <div className="flex justify-center -mt-px">
          <div className="w-2 h-2 bg-surface-elevated border-r border-b border-border-default rotate-45 -translate-y-1" />
        </div>
      </div>
    </div>
  );
}
