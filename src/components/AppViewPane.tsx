"use client";

import type { ComponentProps } from "react";
import ArticleView from "./ArticleView";
import ErrorBoundary from "./ErrorBoundary";
import { MobilePane } from "./MobilePane";
import type { MobilePane as MobilePaneId } from "../hooks/useMobilePane";

interface AppViewPaneProps {
  /** モバイルペイン状態 (sidebar/list/view 切替) */
  mobilePane: MobilePaneId;
  isDesktop: boolean;
  /** ArticleView に丸ごと渡す props */
  articleViewProps: ComponentProps<typeof ArticleView>;
}

/**
 * 3 ペインレイアウトの「右ペイン (記事詳細)」を担うラッパー (#650 Step 1q)。
 *
 * `AppListPane` と対称的な薄いラッパー。main landmark は中央ペイン (`AppListPane` の
 * `MobilePane as="main"`) が単独で担うため、本ペインは `div` のまま (#1225)。
 * 記事詳細側は `ArticleView` / `EmptyArticleView` が `<article>` を使う。`articleViewProps` は
 * `ComponentProps<typeof ArticleView>` 型継承で、ArticleView の prop signature 変化に
 * 自動追従する。
 */
export function AppViewPane({ mobilePane, isDesktop, articleViewProps }: AppViewPaneProps) {
  return (
    <MobilePane pane="view" currentPane={mobilePane} isDesktop={isDesktop}>
      <ErrorBoundary label="記事表示">
        <ArticleView {...articleViewProps} />
      </ErrorBoundary>
    </MobilePane>
  );
}
