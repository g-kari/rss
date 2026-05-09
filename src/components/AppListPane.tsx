"use client";

import type { ComponentProps } from "react";
import ArticleList from "./ArticleList";
import ErrorBoundary from "./ErrorBoundary";
import SkeletonArticleList from "./SkeletonArticleList";
import { MobilePane } from "./MobilePane";
import type { MobilePane as MobilePaneId } from "../hooks/useMobilePane";

interface AppListPaneProps {
  /** モバイルペイン状態 (sidebar/list/view 切替) */
  mobilePane: MobilePaneId;
  isDesktop: boolean;
  /** フィード初回ロード中かつフィードが空ならスケルトン表示 */
  loadingFeeds: boolean;
  feedsEmpty: boolean;
  /** ArticleList に丸ごと渡す props */
  articleListProps: ComponentProps<typeof ArticleList>;
}

/**
 * 3 ペインレイアウトの「中央ペイン (記事一覧)」を担うラッパー (#650 Step 1p)。
 *
 * App.tsx 内で `<MobilePane pane="list">{loading ? <SkeletonArticleList /> :
 * <ErrorBoundary><ArticleList ... /></ErrorBoundary>}</MobilePane>` の 30 行
 * インライン JSX を集約。MobilePane の特殊属性 (id="main-content" / tabIndex=-1 /
 * className="focus:outline-none") もこちら側に閉じ込める。
 *
 * `articleListProps` を 1 つの props オブジェクトとして受けることで、ArticleList
 * の prop signature 変化に追従するときに本コンポーネントの修正が不要になる
 * (ComponentProps<typeof ArticleList> で型継承)。
 */
export function AppListPane({
  mobilePane,
  isDesktop,
  loadingFeeds,
  feedsEmpty,
  articleListProps,
}: AppListPaneProps) {
  return (
    <MobilePane
      pane="list"
      currentPane={mobilePane}
      isDesktop={isDesktop}
      id="main-content"
      tabIndex={-1}
      className="focus:outline-none"
    >
      {loadingFeeds && feedsEmpty ? (
        <SkeletonArticleList layout={articleListProps.layout} />
      ) : (
        <ErrorBoundary label="記事一覧">
          <ArticleList {...articleListProps} />
        </ErrorBoundary>
      )}
    </MobilePane>
  );
}
