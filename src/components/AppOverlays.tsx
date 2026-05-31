"use client";

import { useContext } from "react";
import type { ComponentProps } from "react";
import { BulkSelectionCtx } from "@/contexts/BulkSelectionContext";
import A11yHelpers from "./A11yHelpers";
import OfflineBanner from "./OfflineBanner";
import ToastContainer from "./ToastContainer";
import PiperInitProgressToast from "./PiperInitProgressToast";
import PiperErrorDetailToast from "./PiperErrorDetailToast";
import ConfirmModal from "./ConfirmModal";
import AppModals from "./AppModals";
import NSFWEyeAnimation from "./NSFWEyeAnimation";
import NewArticleBanner from "./NewArticleBanner";
import FocusModeExitButton from "./FocusModeExitButton";
import FocusModeOverlay from "./FocusModeOverlay";
import ArticleDetailOverlay from "./ArticleDetailOverlay";
import ColumnResizeHandles from "./ColumnResizeHandles";

interface AppOverlaysProps {
  // ── A11y ──
  articleAnnouncement: string;

  // ── Network status ──
  isOnline: boolean;
  hasPendingChanges: boolean;

  // ── Confirm modal (window.confirm 代替) ──
  confirmModalProps: ComponentProps<typeof ConfirmModal>;

  // ── App-level modals (snooze / help / settings / feed switcher / session expired) ──
  appModalsProps: ComponentProps<typeof AppModals>;

  // ── NSFW activation animation ──
  showNSFWAnimation: boolean;
  onNSFWAnimationComplete: () => void;

  // ── New article banner ──
  newArticleCount: number;
  focusMode: boolean;
  listFocusMode: boolean;
  dismissNewArticles: () => void;

  // ── Focus mode controls (PC right-top exit button + full-screen overlay) ──
  exitFocusMode: () => void;
  articleViewProps: ComponentProps<typeof ArticleDetailOverlay>["articleViewProps"];

  // ── Article detail overlay (listFocusMode 時のスライドイン詳細) ──
  articleDetailOverlayOpen: boolean;
  closeArticleDetailOverlay: () => void;

  // ── Column resize handles (PC only) ──
  hasOpenPopup: boolean;
  sidebarWidth: number;
  listWidth: number;
  onResizeStart: ComponentProps<typeof ColumnResizeHandles>["onResizeStart"];
  resetWidth: ComponentProps<typeof ColumnResizeHandles>["onResetWidth"];
  nudgeWidth: ComponentProps<typeof ColumnResizeHandles>["onNudgeWidth"];
}

/**
 * 3 ペイン (sidebar / list / view) の手前 (z-order 上は overlay) に配置する
 * グローバル UI 群を集約する (#650 Step 1s)。
 *
 * 「常時可視の通知 + 必要時に出るモーダル/オーバーレイ + PC 専用 chrome」が混在するが、
 * 全て **3 ペインの外側に位置するエレメント** という共通項を持つ。1 つにまとめることで
 * App.tsx の JSX 部分が「overlays → 3 panes」という素直な流れに見える。
 *
 * 本コンポーネントは状態を持たず、純粋に props pass-through するだけ。
 * 個別 modal/overlay の prop signature 変化には `ComponentProps<typeof X>` 型継承で
 * 自動追従する。
 */
export function AppOverlays({
  articleAnnouncement,
  isOnline,
  hasPendingChanges,
  confirmModalProps,
  appModalsProps,
  showNSFWAnimation,
  onNSFWAnimationComplete,
  newArticleCount,
  focusMode,
  listFocusMode,
  dismissNewArticles,
  exitFocusMode,
  articleViewProps,
  articleDetailOverlayOpen,
  closeArticleDetailOverlay,
  hasOpenPopup,
  sidebarWidth,
  listWidth,
  onResizeStart,
  resetWidth,
  nudgeWidth,
}: AppOverlaysProps) {
  const selectedCount = useContext(BulkSelectionCtx).size;
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedCount > 0 ? `${selectedCount}件選択中` : ""}
      </div>
      <A11yHelpers announcement={articleAnnouncement} />
      <OfflineBanner isOnline={isOnline} hasPendingChanges={hasPendingChanges} />
      <ToastContainer />
      <PiperInitProgressToast />
      <PiperErrorDetailToast />
      <ConfirmModal {...confirmModalProps} />
      <AppModals {...appModalsProps} />
      {/* NSFW 目が開くアニメーション */}
      {showNSFWAnimation && <NSFWEyeAnimation onComplete={onNSFWAnimationComplete} />}
      <NewArticleBanner
        newArticleCount={newArticleCount}
        focusMode={focusMode}
        listFocusMode={listFocusMode}
        onDismiss={dismissNewArticles}
      />
      <FocusModeExitButton listFocusMode={listFocusMode} onExit={exitFocusMode} />
      <FocusModeOverlay
        focusMode={focusMode}
        exitFocusMode={exitFocusMode}
        articleViewProps={articleViewProps}
      />
      <ArticleDetailOverlay
        open={articleDetailOverlayOpen}
        onClose={closeArticleDetailOverlay}
        articleViewProps={articleViewProps}
      />
      <ColumnResizeHandles
        listFocusMode={listFocusMode}
        hasOpenPopup={hasOpenPopup}
        sidebarWidth={sidebarWidth}
        listWidth={listWidth}
        onResizeStart={onResizeStart}
        onResetWidth={resetWidth}
        onNudgeWidth={nudgeWidth}
      />
    </>
  );
}
