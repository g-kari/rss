"use client";

import { useMemo } from "react";
import type { Feed } from "../types";
import { computeFeedStructuralSignature } from "../lib/feed-signature";

/**
 * `feeds` 配列の構造 signature を memo 化して返す hook。
 *
 * 5 分 polling で `feeds` の reference が新しくなっても構造 (id / title / category /
 * groupId / nsfw / priority / view) が変わっていなければ同じ文字列を返すため、
 * 下流の `useMemo` / `useCallback` の deps に置くと不要な再計算を skip できる。
 *
 * `useMemo(() => computeFeedStructuralSignature(feeds), [feeds])` は
 * 5 つの sibling site (`useSidebarFeeds` / `useFeedSidebarActions` / `useArticleViewProps` /
 * `useInboxProgress` / `ArticleList`) で verbatim 重複していたため canonical hook に集約した。
 * 新規 consumer は inline useMemo でなく本 hook を使うこと。
 *
 * @param feeds 対象のフィード配列 (canonical helper の signature に合わせて mutable `Feed[]`)
 * @returns 構造が変わらない限り安定した signature 文字列
 */
export function useFeedStructuralSignature(feeds: Feed[]): string {
  return useMemo(() => computeFeedStructuralSignature(feeds), [feeds]);
}
