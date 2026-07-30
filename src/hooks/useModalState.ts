"use client";

import { useState } from "react";

interface ModalState {
  /** スヌーズ対象の記事 ID（null = スヌーズモーダル非表示） */
  snoozeTargetId: string | null;
  setSnoozeTargetId: (id: string | null) => void;
  /**
   * #748: snooze 完了で article が DOM から消えた場合のフォーカス復元先。
   * snooze trigger 時に `document.activeElement` を snapshot して保存する。
   */
  snoozeReturnFocusEl: HTMLElement | null;
  setSnoozeReturnFocusEl: (el: HTMLElement | null) => void;
  /** スクリーンリーダー向けのライブ記事アナウンス */
  articleAnnouncement: string;
  setArticleAnnouncement: (msg: string) => void;
}

/**
 * App レベルで管理するモーダル・ダイアログ状態を集約するフック。
 *
 * - スヌーズモーダルの表示制御（snoozeTargetId）
 * - スクリーンリーダー向けライブアナウンス（articleAnnouncement）
 *
 * showSettings / showHelp / showFeedSwitcher は App.tsx で直接 useState 管理する
 * （`?` / Escape の keydown ハンドラと密に連携するため）。
 */
export function useModalState(): ModalState {
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [snoozeReturnFocusEl, setSnoozeReturnFocusEl] = useState<HTMLElement | null>(null);
  const [articleAnnouncement, setArticleAnnouncement] = useState("");

  return {
    snoozeTargetId,
    setSnoozeTargetId,
    snoozeReturnFocusEl,
    setSnoozeReturnFocusEl,
    articleAnnouncement,
    setArticleAnnouncement,
  };
}
