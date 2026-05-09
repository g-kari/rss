import type { JSX } from "react";
import type { Article, EngagementAction, AiRating } from "../../types";
import { AI_RATINGS } from "../../types";
import type { AiError, TranslationProvider } from "../../hooks/useArticleAi";

interface ArticleAiPanelProps {
  aiResult: string | null;
  /** AI 要約のプロバイダー (#697) — 「Chrome 要約 / Workers AI」バッジ表示に使用 */
  aiResultProvider?: TranslationProvider;
  aiError: AiError | null;
  summaryRating: AiRating | null;
  setSummaryRating: (rating: AiRating) => void;
  article: Article;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
  onRetry?: () => void;
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
    .filter((el): el is JSX.Element => el !== null);
}

function RetryIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 .49-3" />
    </svg>
  );
}

export default function ArticleAiPanel({
  aiResult,
  aiResultProvider,
  aiError,
  summaryRating,
  setSummaryRating,
  article,
  onEngagement,
  onRetry,
}: ArticleAiPanelProps) {
  return (
    <>
      {aiResult && (
        <div
          className="mb-8 px-4 py-3 rounded-lg border border-border-default bg-surface-base animate-fade-up"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint">AI 要約</p>
              {aiResultProvider && (
                <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-subtle">
                  {aiResultProvider === "browser" ? "Chrome 要約" : "Workers AI"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {AI_RATINGS.map((rating) => (
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
      {aiError && (
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-error mt-[1px] shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-error">{aiError.message}</p>
              {aiError.type === "rate_limit" && (
                <p className="text-[11px] text-text-muted mt-0.5">
                  少し時間をおいてから再試行してください。
                </p>
              )}
            </div>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200"
            >
              <RetryIcon />
              再試行
            </button>
          )}
        </div>
      )}
    </>
  );
}
