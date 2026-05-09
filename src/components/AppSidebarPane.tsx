"use client";

import type { ComponentProps } from "react";
import FeedSidebar from "./feed-sidebar";
import ErrorBoundary from "./ErrorBoundary";
import SkeletonSidebar from "./SkeletonSidebar";
import { MobilePane } from "./MobilePane";
import { FeedSidebarProvider } from "../contexts/FeedSidebarContext";
import type { MobilePane as MobilePaneId } from "../hooks/useMobilePane";
import type { FeedSidebarActions } from "../contexts/FeedSidebarContext";

interface AppSidebarPaneProps {
  /** モバイルペイン状態 (sidebar/list/view 切替) */
  mobilePane: MobilePaneId;
  isDesktop: boolean;
  /** フィード初回ロード中かつフィードが空ならスケルトン表示 */
  loadingFeeds: boolean;
  feedsEmpty: boolean;
  /** FeedSidebarProvider に渡す actions オブジェクト */
  feedSidebarActions: FeedSidebarActions;
  /** FeedSidebar に丸ごと渡す props */
  feedSidebarProps: ComponentProps<typeof FeedSidebar>;
}

/**
 * 3 ペインレイアウトの「左ペイン (フィードサイドバー)」を担うラッパー (#650 Step 1r)。
 *
 * `AppListPane` (Step 1p) / `AppViewPane` (Step 1q) と対称な薄いラッパー。
 * `FeedSidebarProvider` でラップしてサイドバー配下に actions を提供する点が
 * 他 2 ペインと異なる。
 *
 * `feedSidebarProps` は `ComponentProps<typeof FeedSidebar>` 型継承で、
 * FeedSidebar の prop signature 変化に自動追従する。
 */
export function AppSidebarPane({
  mobilePane,
  isDesktop,
  loadingFeeds,
  feedsEmpty,
  feedSidebarActions,
  feedSidebarProps,
}: AppSidebarPaneProps) {
  return (
    <MobilePane pane="sidebar" currentPane={mobilePane} isDesktop={isDesktop}>
      {loadingFeeds && feedsEmpty ? (
        <SkeletonSidebar />
      ) : (
        <ErrorBoundary label="サイドバー">
          <FeedSidebarProvider value={feedSidebarActions}>
            <FeedSidebar {...feedSidebarProps} />
          </FeedSidebarProvider>
        </ErrorBoundary>
      )}
    </MobilePane>
  );
}
