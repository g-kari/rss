"use client";

import { useEffect, useRef, useState } from "react";

// 自動ページ追加ロードの上限。フィルター時にフィードを深く遡れるよう
// 5 回まで許可（元 3 回はギャラリーの画像中心フィードで早期に
// 自動ロードが止まり、無限スクロールが体感止まる症状の原因 #636）。
const MAX_AUTO_LOAD = 5;

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
  // #772: サーバーページ読込でフィルター後マッチ件数が 0 件のとき、
  // hasMore / feedHasMorePages / loadingArticles の値が変わらず effect が再実行されない罠を回避。
  // loadedCount を deps に含めることで、各サーバー読込完了後に effect が再評価され、
  // 「未読 0 件 → サーバーから次ページ取得 → 依然 0 件 → さらに次ページ取得」の連鎖を担保する。
  const [loadedCount, setLoadedCount] = useState(0);

  // フィード切り替え・フィルター変更時にカウントをリセット
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    autoLoadCountRef.current = 0;
    setLoadedCount(0);
  }, resetDeps);

  useEffect(() => {
    if (hasMore || !feedHasMorePages || autoLoadingRef.current) return;
    if (loadingArticles) return;
    if (autoLoadCountRef.current >= MAX_AUTO_LOAD) return;
    autoLoadingRef.current = true;
    autoLoadCountRef.current += 1;
    onLoadMore().finally(() => {
      autoLoadingRef.current = false;
      setLoadedCount((c) => c + 1);
    });
  }, [hasMore, feedHasMorePages, onLoadMore, loadingArticles, loadedCount]);
}
