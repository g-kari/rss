"use client";

import type { Article } from "../../types";
import type { AiOperationResult, AiError } from "../../hooks/useArticleAi";
import Spinner from "../Spinner";
import { TTS_RATES } from "../../hooks/useSpeechSynthesis";
import { cycleValue } from "../../lib/article-utils";
import { DownloadIcon } from "./icons";

interface Props {
  article: Article;
  hasContent: boolean;
  hasImages: boolean;
  fetching: boolean;

  /* AI */
  aiResult: string | null;
  aiLoading: boolean;
  /** UX 監査 (#1): エラー時にヘッダーボタンを `border-error` で目立たせる */
  aiError: AiError | null;
  resetAi: () => void;
  doRunAi: (link: string, articleId: string) => void;
  handleTranslate: () => void;
  translateResult: AiOperationResult | null;
  translateLoading: boolean;
  /** UX 監査 (#1): エラー時にヘッダーボタンを `border-error` で目立たせる */
  translateError: AiError | null;

  /* TTS — voice 選択は #675 Phase 1b で UserSettingsModal の DisplayTabPanel に移動 */
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  ttsRate: number;
  ttsCycleRate: () => void;
  /** #727: 3 段階 (full / half / muted) で cycle する音量。再生中のみ表示 */
  ttsVolume: number;
  ttsCycleVolume: () => void;
  onTtsToggle: () => void;
  autoMode: boolean;
  onToggleAutoMode: () => void;

  /* 画像ダウンロード */
  downloadAllImages: () => void;
  downloadingImages: boolean;
  imageDownloadProgress: { done: number; total: number } | null;
}

/**
 * 記事ヘッダーの AI/TTS/画像ダウンロード ボタン群。
 *
 * AI 要約・翻訳ボタン、画像ダウンロード、TTS 再生・速度切替、オートモードをまとめて
 * レンダリングする。`hasContent` / `ttsSupported` 等のフラグで個別にレンダリングを制御。
 */
export default function ArticleHeaderAiTts({
  article,
  hasContent,
  hasImages,
  fetching,
  aiResult,
  aiLoading,
  aiError,
  resetAi,
  doRunAi,
  handleTranslate,
  translateResult,
  translateLoading,
  translateError,
  ttsSupported,
  ttsPlaying,
  ttsPaused,
  ttsRate,
  ttsCycleRate,
  ttsVolume,
  ttsCycleVolume,
  onTtsToggle,
  autoMode,
  onToggleAutoMode,
  downloadAllImages,
  downloadingImages,
  imageDownloadProgress,
}: Props) {
  return (
    <>
      {hasContent && (
        <div className="flex items-center gap-1 mr-1">
          <button
            onClick={() => {
              if (aiResult) {
                resetAi();
                return;
              }
              if (article.link) doRunAi(article.link, article.id);
            }}
            disabled={aiLoading || fetching}
            aria-busy={aiLoading || fetching}
            title={
              aiError ? `AI 要約エラー: ${aiError.message ?? "失敗しました"} (a)` : "AI 要約 (a)"
            }
            aria-label="AI 要約"
            aria-pressed={!!aiResult}
            className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 disabled:opacity-50 ${
              aiResult
                ? "border-ink bg-ink text-ink-text"
                : aiError
                  ? "border-error text-error hover:bg-error/10"
                  : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
            }`}
          >
            {aiLoading ? "…" : "要約"}
          </button>
          <button
            onClick={handleTranslate}
            disabled={translateLoading || fetching}
            aria-busy={translateLoading || fetching}
            title={
              translateError
                ? `AI 翻訳エラー: ${translateError.message ?? "失敗しました"} (z)`
                : "AI 翻訳（日本語）(z)"
            }
            aria-label="AI 翻訳"
            aria-pressed={!!translateResult}
            className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 disabled:opacity-50 ${
              translateResult
                ? "border-ink bg-ink text-ink-text"
                : translateError
                  ? "border-error text-error hover:bg-error/10"
                  : "border-border-default text-text-muted hover:border-text-muted hover:text-text-default"
            }`}
          >
            {translateLoading ? "…" : "翻訳"}
          </button>
        </div>
      )}

      {hasImages && (
        <button
          onClick={() => {
            void downloadAllImages();
          }}
          disabled={downloadingImages}
          aria-busy={downloadingImages}
          title="記事内の画像をすべてダウンロード"
          aria-label="画像をダウンロード"
          className="p-2 -m-2 lg:p-0 lg:m-0 text-text-faint hover:text-text-muted transition-colors duration-200 disabled:opacity-50 flex items-center gap-1 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px]"
        >
          {downloadingImages && imageDownloadProgress ? (
            <span className="text-[10px] tabular-nums tracking-tight">
              {imageDownloadProgress.done}/{imageDownloadProgress.total}
            </span>
          ) : null}
          {downloadingImages ? <Spinner /> : <DownloadIcon />}
        </button>
      )}

      {ttsSupported && hasContent && (
        <button
          onClick={onTtsToggle}
          title={ttsPlaying || ttsPaused ? "読み上げを停止" : "読み上げ (P)"}
          aria-label={ttsPlaying || ttsPaused ? "読み上げを停止" : "読み上げ"}
          aria-pressed={ttsPlaying || ttsPaused}
          className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px] ${
            ttsPlaying || ttsPaused
              ? "text-ink hover:text-text-muted"
              : "text-text-faint hover:text-text-muted"
          }`}
        >
          {ttsPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="none">
              <rect x="2" y="2" width="10" height="10" rx="2" />
            </svg>
          ) : ttsPaused ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 5H5L9 2V12L5 9H2V5Z" />
              <path d="M11 4.5C11 4.5 12.5 6 12.5 7C12.5 8 11 9.5 11 9.5" strokeDasharray="2 1.5" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 5H5L9 2V12L5 9H2V5Z" />
              <path d="M11 4.5C11 4.5 12.5 6 12.5 7C12.5 8 11 9.5 11 9.5" />
            </svg>
          )}
        </button>
      )}

      {hasContent && (
        <button
          onClick={onToggleAutoMode}
          title={
            ttsSupported
              ? autoMode
                ? "オートモード OFF (Shift+A)"
                : "オートモード ON：自動で全文取得 → 読み上げ → 次の記事へ (Shift+A)"
              : "音声合成 API 非対応のためオートモードは使えません"
          }
          aria-label={autoMode ? "オートモード OFF" : "オートモード ON"}
          aria-pressed={autoMode}
          className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px] ${
            autoMode ? "text-ink hover:text-text-muted" : "text-text-faint hover:text-text-muted"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11.5 5.5C10.5 3.5 8.5 2.5 7 2.5C4.5 2.5 2.5 4.5 2.5 7" />
            <polyline points="11.5 2.5 11.5 5.5 8.5 5.5" />
            <path d="M2.5 8.5C3.5 10.5 5.5 11.5 7 11.5C9.5 11.5 11.5 9.5 11.5 7" />
            <polyline points="2.5 11.5 2.5 8.5 5.5 8.5" />
          </svg>
        </button>
      )}

      {ttsSupported && hasContent && (
        <button
          onClick={ttsCycleRate}
          title={`読み上げ速度: ${ttsRate}x → 次: ${cycleValue(TTS_RATES, ttsRate)}x（クリック / Shift+R）`}
          aria-label={`読み上げ速度 ${ttsRate}倍`}
          className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 text-[10px] font-medium tabular-nums leading-none ${
            ttsPlaying || ttsPaused
              ? "text-ink hover:text-text-muted"
              : "text-text-faint hover:text-text-muted"
          }`}
        >
          {`${ttsRate}x`}
        </button>
      )}
      {(ttsPlaying || ttsPaused) && (
        <button
          onClick={ttsCycleVolume}
          title={`音量: ${Math.round(ttsVolume * 100)}% → クリックで切替（フル / 半 / ミュート）`}
          aria-label={`音量 ${Math.round(ttsVolume * 100)}パーセント`}
          className="p-2 -m-2 lg:p-0 lg:m-0 text-ink hover:text-text-muted transition-colors duration-200"
        >
          {ttsVolume >= 0.99 ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 5.5h2.5L7.5 3v8L4.5 8.5H2v-3z" />
              <path d="M9.5 5.5C10 6 10 8 9.5 8.5" />
              <path d="M11 4C12 5 12 9 11 10" />
            </svg>
          ) : ttsVolume >= 0.49 ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 5.5h2.5L7.5 3v8L4.5 8.5H2v-3z" />
              <path d="M9.5 5.5C10 6 10 8 9.5 8.5" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 5.5h2.5L7.5 3v8L4.5 8.5H2v-3z" />
              <path d="M9 5l4 4M13 5l-4 4" />
            </svg>
          )}
        </button>
      )}
    </>
  );
}
