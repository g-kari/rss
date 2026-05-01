import React from "react";
import type { Article, EngagementAction } from "../../types";

interface ArticleAiPanelProps {
  aiResult: string | null;
  aiError: string;
  summaryRating: "good" | "neutral" | "bad" | null;
  setSummaryRating: (rating: "good" | "neutral" | "bad") => void;
  article: Article;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
}

function renderSummary(text: string) {
  const lines = text.split("\n");
  return lines
    .map((line, i) => {
      if (line.startsWith("## ")) {
        return (
          <p
            key={i}
            className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-faint mt-3 mb-1.5 first:mt-0"
          >
            {line.slice(3)}
          </p>
        );
      }
      if (/^[・\-•]\s/.test(line)) {
        const content = line.replace(/^[・\-•]\s*/, "");
        return (
          <div key={i} className="flex gap-2 text-[13px] leading-[1.7] text-text-default">
            <span className="text-text-muted shrink-0 mt-[1px]">·</span>
            <span>{content}</span>
          </div>
        );
      }
      if (line.trim() === "") return null;
      return (
        <p key={i} className="text-[13px] leading-[1.8] text-text-soft">
          {line}
        </p>
      );
    })
    .filter((el): el is React.JSX.Element => el !== null);
}

export default function ArticleAiPanel({
  aiResult,
  aiError,
  summaryRating,
  setSummaryRating,
  article,
  onEngagement,
}: ArticleAiPanelProps) {
  return (
    <>
      {aiResult && (
        <div className="mb-8 px-4 py-3 rounded-lg border border-border-default bg-surface-base animate-fade-up">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint">AI 要約</p>
            <div className="flex items-center gap-1">
              {(["good", "neutral", "bad"] as const).map((rating) => (
                <button
                  key={rating}
                  title={rating === "good" ? "良い" : rating === "neutral" ? "普通" : "悪い"}
                  aria-label={`要約の評価: ${rating === "good" ? "良い" : rating === "neutral" ? "普通" : "悪い"}`}
                  onClick={() => {
                    if (summaryRating === rating) return;
                    setSummaryRating(rating);
                    onEngagement?.(
                      article.id,
                      article.feedHash,
                      "ai_feedback",
                      `${rating}:summary`,
                    );
                  }}
                  className={`text-[14px] leading-none transition-all duration-150 ${
                    summaryRating === rating
                      ? "opacity-100 scale-110"
                      : summaryRating !== null
                        ? "opacity-25"
                        : "opacity-40 hover:opacity-100"
                  }`}
                >
                  {rating === "good" ? "👍" : rating === "neutral" ? "😐" : "👎"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-0.5">{renderSummary(aiResult)}</div>
        </div>
      )}
      {aiError && <p className="mb-6 text-[11px] text-rose-400">{aiError}</p>}
    </>
  );
}
