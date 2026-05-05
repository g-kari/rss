"use client";

import { useState } from "react";

export interface ModalState {
  /** スヌーズ対象の記事 ID（null = スヌーズモーダル非表示） */
  snoozeTargetId: string | null;
  setSnoozeTargetId: (id: string | null) => void;
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
 * showSettings / showHelp / showFeedSwitcher は useUIState が管理する
 * （keydown ショートカットとの密な連携があるため）。
 */
export function useModalState(): ModalState {
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [articleAnnouncement, setArticleAnnouncement] = useState("");

  return {
    snoozeTargetId,
    setSnoozeTargetId,
    articleAnnouncement,
    setArticleAnnouncement,
  };
}
