"use client";

import { useEffect, useRef } from "react";

const MAX_AUTO_LOAD = 3;

/**
 * フィルター適用後に表示件数が不足している場合、サーバーから過去記事を自動取得する。
 * 未読フィルター等でローカルの記事が枯渇しても、サーバー側に残ページがある限り自動継続する。
 * 初回ロード中・連続3回超えの場合はスキップ（無限ロード防止）。
 *
 * @param hasMore クライアント側にまだ表示可能な記事があるか
 * @param feedHasMorePages サーバー側に未取得ページが残っているか
 * @param loadingArticles 記事ロード中フラグ
 * @param onLoadMore 記事追加ロード関数
 * @param resetDeps カウントリセットのトリガーとなる依存値配列（フィード切り替え・フィルター変更時）
 */
export function useAutoLoadMoreArticles(
  hasMore: boolean,
  feedHasMorePages: boolean,
  loadingArticles: boolean,
  onLoadMore: () => Promise<void>,
  resetDeps: unknown[],
): void {
  const autoLoadingRef = useRef(false);
  const autoLoadCountRef = useRef(0);

  // フィード切り替え・フィルター変更時にカウントをリセット
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    autoLoadCountRef.current = 0;
  }, resetDeps);

  useEffect(() => {
    if (hasMore || !feedHasMorePages || autoLoadingRef.current) return;
    if (loadingArticles) return;
    if (autoLoadCountRef.current >= MAX_AUTO_LOAD) return;
    autoLoadingRef.current = true;
    autoLoadCountRef.current += 1;
    onLoadMore().finally(() => {
      autoLoadingRef.current = false;
    });
  }, [hasMore, feedHasMorePages, onLoadMore, loadingArticles]);
}
