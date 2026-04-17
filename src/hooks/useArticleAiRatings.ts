"use client";

import { useEffect, useState } from "react";
import type { AiOperationResult } from "./useArticleAi";

export type AiRating = "good" | "neutral" | "bad" | null;
export type ContentTab = "original" | "translate";

interface UseArticleAiRatingsParams {
  articleId: string | undefined;
  translateResult: AiOperationResult | null;
}

interface UseArticleAiRatingsResult {
  summaryRating: AiRating;
  setSummaryRating: (rating: AiRating) => void;
  translateRating: AiRating;
  setTranslateRating: (rating: AiRating) => void;
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
  const [summaryRating, setSummaryRating] = useState<AiRating>(null);
  const [translateRating, setTranslateRating] = useState<AiRating>(null);
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
