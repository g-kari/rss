"use client";

import { useEffect, useState } from "react";
import type { AiOperationResult } from "./useArticleAi";
import type { AiRating } from "../types";

/**
 * 評価状態は「未評価 (null)」を含むので `AiRating | null` を使う。
 * 評価値そのものの enum は `src/types.ts` の `AI_RATINGS` / `AiRating` を参照。
 */
export type AiRatingState = AiRating | null;
export type ContentTab = "original" | "translate";

interface UseArticleAiRatingsParams {
  articleId: string | undefined;
  translateResult: AiOperationResult | null;
}

interface UseArticleAiRatingsResult {
  summaryRating: AiRatingState;
  setSummaryRating: (rating: AiRatingState) => void;
  translateRating: AiRatingState;
  setTranslateRating: (rating: AiRatingState) => void;
  contentTab: ContentTab;
  setContentTab: (tab: ContentTab) => void;
}

/**
 * AI 要約・翻訳の評価ボタン状態と原文/翻訳タブの切替状態を管理する。
 * - 記事切り替え時に全状態をリセット
 * - 翻訳結果が出たら自動で翻訳タブへ切り替え、消えたら原文タブへ戻す
 */
export function useArticleAiRatings({
  articleId,
  translateResult,
}: UseArticleAiRatingsParams): UseArticleAiRatingsResult {
  const [summaryRating, setSummaryRating] = useState<AiRatingState>(null);
  const [translateRating, setTranslateRating] = useState<AiRatingState>(null);
  const [contentTab, setContentTab] = useState<ContentTab>("original");

  useEffect(() => {
    setSummaryRating(null);
    setTranslateRating(null);
    setContentTab("original");
  }, [articleId]);

  useEffect(() => {
    if (translateResult) setContentTab("translate");
    else setContentTab("original");
  }, [translateResult]);

  return {
    summaryRating,
    setSummaryRating,
    translateRating,
    setTranslateRating,
    contentTab,
    setContentTab,
  };
}
