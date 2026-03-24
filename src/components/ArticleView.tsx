'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Article, FontSize } from '../types';
import { readingTime } from '../lib/article-utils';
import { STORAGE_KEYS, storageGet, storageSet, storageRemove, storageListKeys } from '../lib/storage';
import { extractEmbedInfo, processContent, stripIframes } from '../lib/embed-utils';

type AiMode = 'summary' | 'translation';

const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  small: 'text-[14px] leading-[1.75]',
  medium: 'text-[16px] leading-[1.9]',
  large: 'text-[19px] leading-[2.0]',
};
const FONT_SIZE_CYCLE: FontSize[] = ['small', 'medium', 'large'];

interface Props {
  article: Article | null;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  onMobileBack?: () => void;
  fontSize?: FontSize;
  onChangeFontSize?: (size: FontSize) => void;
  showToast?: (msg: string) => void;
}

/* ── 全文キャッシュ (localStorage) ── */
const CACHE_MAX = 15;

/* ── AI 結果キャッシュ (localStorage) ── */
const AI_CACHE_MAX = 30;

function loadCache(id: string): string | null {
  return storageGet(`${STORAGE_KEYS.CONTENT_CACHE_PREFIX}${id}`);
}

function saveCache(id: string, content: string) {
  const keys = storageListKeys(STORAGE_KEYS.CONTENT_CACHE_PREFIX);
  if (keys.length >= CACHE_MAX) storageRemove(keys[0]);
  storageSet(`${STORAGE_KEYS.CONTENT_CACHE_PREFIX}${id}`, content);
}

function loadAiCache(articleId: string, mode: AiMode): string | null {
  return storageGet(`${STORAGE_KEYS.AI_CACHE_PREFIX}${articleId}:${mode}`);
}

function saveAiCache(articleId: string, mode: AiMode, text: string): void {
  const keys = storageListKeys(STORAGE_KEYS.AI_CACHE_PREFIX);
  if (keys.length >= AI_CACHE_MAX) storageRemove(keys[0]);
  storageSet(`${STORAGE_KEYS.AI_CACHE_PREFIX}${articleId}:${mode}`, text);
}


const SHORT_CONTENT_THRESHOLD = 400;


export default function ArticleView({ article, isBookmarked, onToggleBookmark, onMobileBack, fontSize = 'medium', onChangeFontSize, showToast }: Props) {
  // キャッシュをレンダリング時に同期取得 → 記事切り替え時もフラッシュなし
  const cachedContent = useMemo(
    () => (article?.id ? loadCache(article.id) : null),
    [article?.id],
  );
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [aiResult, setAiResult] = useState<{ mode: AiMode; text: string } | null>(null);
  const [aiLoading, setAiLoading] = useState<AiMode | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  // 最後に使った AI モードを localStorage で永続化（記事切り替え後も自動実行）
  const [stickyAiMode, setStickyAiMode] = useState<AiMode | null>(() => {
    const v = storageGet(STORAGE_KEYS.AI_MODE);
    return v === 'summary' || v === 'translation' ? v : null;
  });
  const stickyAiModeRef = useRef(stickyAiMode);
  stickyAiModeRef.current = stickyAiMode;

  /** AI fetch のみ（トグルなし）。記事切り替え時の自動実行にも使用 */
  const doRunAi = useCallback(async (mode: AiMode, contentHtml: string, articleId?: string) => {
    if (!contentHtml.trim()) return;

    // キャッシュヒット時は API コールなし
    if (articleId) {
      const cached = loadAiCache(articleId, mode);
      if (cached) {
        setAiResult({ mode, text: cached });
        return;
      }
    }

    setAiLoading(mode);
    try {
      const endpoint = mode === 'summary' ? '/api/ai/summarize' : '/api/ai/translate';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: contentHtml }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (data.result) {
        if (articleId) saveAiCache(articleId, mode, data.result);
        setAiResult({ mode, text: data.result });
      }
    } finally {
      setAiLoading(null);
    }
  }, []);

  /** ボタンクリック用: トグル + モード永続化 */
  const runAi = useCallback((mode: AiMode, contentHtml: string) => {
    if (aiResult?.mode === mode) {
      setAiResult(null);
      setStickyAiMode(null);
      storageRemove(STORAGE_KEYS.AI_MODE);
      return;
    }
    setStickyAiMode(mode);
    storageSet(STORAGE_KEYS.AI_MODE, mode);
    doRunAi(mode, contentHtml, article?.id);
  }, [aiResult, doRunAi, article?.id]);

  // 記事が変わったらリセット → sticky モードが設定済みなら自動実行
  useEffect(() => {
    setFetchError('');
    setAiResult(null);
    setFetchedContent(null);
    setScrollProgress(0);
    setAiLoading(null);
    if (stickyAiModeRef.current && article?.id) {
      const content = article.content ?? article.summary;
      if (content) doRunAi(stickyAiModeRef.current, content, article.id);
    }
  }, [article?.id, doRunAi]);

  async function fetchFullContent() {
    if (!article?.link) return;
    setFetching(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/content?url=${encodeURIComponent(article.link)}`);
      const data = await res.json() as { content?: string; error?: string };
      if (data.content) {
        saveCache(article.id, data.content);
        setFetchedContent(data.content);
      } else {
        setFetchError(data.error ?? '取得できませんでした');
      }
    } catch {
      setFetchError('ネットワークエラー');
    } finally {
      setFetching(false);
    }
  }

  if (!article) {
    return (
      <main className="h-full relative overflow-y-auto flex items-center justify-center bg-surface-base">
        {onMobileBack && (
          <button
            onClick={onMobileBack}
            className="lg:hidden absolute top-3 left-3 p-1.5 text-text-muted hover:text-text-strong transition-colors"
            aria-label="記事一覧に戻る"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
          </button>
        )}
        <div className="text-center animate-fade-in">
          <svg className="w-8 h-8 mx-auto mb-3 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-[11px] tracking-[0.1em] text-text-faint">記事を選択</p>
        </div>
      </main>
    );
  }

  const embedInfo = article.link ? extractEmbedInfo(article.link) : null;

  // 取得済みコンテンツ: フェッチ結果 > キャッシュ > RSS 本文
  const storedContent = fetchedContent ?? cachedContent;
  const rawContent = storedContent ?? article.content ?? null;
  const processedContent = rawContent
    ? embedInfo
      ? stripIframes(rawContent)
      : processContent(rawContent)
    : null;

  const isShortContent = !article.content || article.content.length < SHORT_CONTENT_THRESHOLD;
  const canFetch = !embedInfo && article.link && isShortContent && !storedContent;
  const hasContent = !!(processedContent || article.summary);

  function handleScroll(e: React.UIEvent<HTMLElement>) {
    const el = e.currentTarget;
    const scrollable = el.scrollHeight - el.clientHeight;
    setScrollProgress(scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 0);
  }

  return (
    <main className="h-full overflow-y-auto bg-surface-elevated animate-fade-in relative" onScroll={handleScroll}>
      {scrollProgress > 0 && (
        <div
          className="sticky top-0 left-0 h-[2px] bg-ink z-10 transition-[width] duration-75 ease-linear"
          style={{ width: `${scrollProgress}%` }}
        />
      )}
      <div className="max-w-2xl mx-auto px-4 py-6 lg:px-10 lg:py-12">
        {/* メタ */}
        <div className="flex items-center gap-4 mb-5 text-[11px] text-text-muted">
          {onMobileBack && (
            <button
              onClick={onMobileBack}
              className="lg:hidden -ml-1 mr-1 p-1.5 text-text-muted hover:text-text-strong transition-colors flex-shrink-0"
              aria-label="記事一覧に戻る"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3L5 8l5 5"/>
              </svg>
            </button>
          )}
          {article.publishedAt && (
            <time className="tracking-[0.04em]">
              {new Date(article.publishedAt).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}
          {article.author && (
            <span className="tracking-[0.04em] text-text-muted">{article.author}</span>
          )}
          {article.link && !embedInfo && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted hover:text-text-default transition-colors duration-200 tracking-[0.04em]"
            >
              元記事 ↗
            </a>
          )}
          {(() => {
            const src = processedContent ?? article.summary;
            const mins = src ? readingTime(src) : 0;
            return mins > 1 ? (
              <span className="tracking-[0.04em] text-text-faint">約{mins}分</span>
            ) : null;
          })()}

          {/* フォントサイズ切り替え */}
          {onChangeFontSize && (
            <div className="ml-auto flex items-center gap-0.5">
              {FONT_SIZE_CYCLE.map((size) => (
                <button
                  key={size}
                  onClick={() => onChangeFontSize(size)}
                  title={size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                  className={`px-1.5 py-0.5 rounded transition-colors duration-150 ${
                    fontSize === size
                      ? 'text-text-strong'
                      : 'text-text-faint hover:text-text-muted'
                  }`}
                  style={{
                    fontSize: size === 'small' ? '10px' : size === 'medium' ? '12px' : '14px',
                    lineHeight: 1,
                  }}
                >
                  A
                </button>
              ))}
            </div>
          )}

          {/* AI ボタン */}
          {hasContent && (
            <div className={`${onChangeFontSize || !hasContent ? '' : 'ml-auto'} flex items-center gap-1`}>
              {(['summary', 'translation'] as AiMode[]).map((mode) => {
                const isActive = aiResult?.mode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => runAi(mode, processedContent ?? article.summary ?? '')}
                    disabled={!!aiLoading}
                    title={mode === 'summary' ? 'AI 要約' : '日本語翻訳'}
                    className={`text-[10px] tracking-[0.06em] px-2 py-0.5 rounded border transition-all duration-200 disabled:opacity-50 ${
                      isActive
                        ? 'border-ink bg-ink text-ink-text'
                        : 'border-border-default text-text-muted hover:border-text-muted hover:text-text-default'
                    }`}
                  >
                    {aiLoading === mode ? '…' : mode === 'summary' ? '要約' : '日本語'}
                  </button>
                );
              })}
            </div>
          )}

          {article.link && showToast && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(article.link!).then(() => {
                  showToast('リンクをコピーしました');
                }).catch(() => {
                  showToast('コピーに失敗しました');
                });
              }}
              title="リンクをコピー (c)"
              className="text-text-faint hover:text-text-muted transition-colors duration-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </button>
          )}

          <button
            onClick={() => onToggleBookmark(article.id)}
            title={isBookmarked ? 'ブックマーク解除 (b)' : 'ブックマーク (b)'}
            className={`transition-colors duration-200 ${!hasContent && !onChangeFontSize ? 'ml-auto' : ''} ${
              isBookmarked ? 'text-bookmark hover:text-text-muted' : 'text-text-faint hover:text-bookmark'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
          </button>
        </div>

        {/* タイトル */}
        <h1 className="text-[22px] font-light leading-snug text-text-strong tracking-[0.02em] mb-8">
          {article.title}
        </h1>

        {/* メディア埋め込み */}
        {embedInfo && embedInfo.type === 'video' && (
          <div className="relative mb-8" style={{ paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '8px' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embedInfo.embedUrl}
              title={article.title}
              allow={embedInfo.allow}
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              style={{ border: 0, borderRadius: '8px' }}
            />
          </div>
        )}
        {embedInfo && embedInfo.type === 'audio' && (
          <div className="mb-8 rounded-xl overflow-hidden">
            <iframe
              src={embedInfo.embedUrl}
              title={article.title}
              allow={embedInfo.allow}
              height={embedInfo.audioHeight ?? 152}
              style={{ border: 0, width: '100%', borderRadius: '12px' }}
            />
          </div>
        )}

        {!embedInfo && <div className="border-t border-border-subtle mb-8" />}

        {/* AI 結果パネル */}
        {aiResult && (
          <div className="mb-8 px-4 py-3 rounded-lg border border-border-default bg-surface-base animate-fade-up">
            <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint mb-2">
              {aiResult.mode === 'summary' ? 'AI 要約' : 'AI 翻訳'}
            </p>
            <p className="text-[14px] leading-[1.8] text-text-default">{aiResult.text}</p>
          </div>
        )}

        {/* OGP 画像 (埋め込みなし・本文なし時) */}
        {!embedInfo && article.ogImage && !processedContent && (
          <img
            src={article.ogImage}
            alt=""
            className="w-full rounded-lg object-cover mb-6 max-h-56"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* 本文 */}
        {processedContent ? (
          <div
            className={`article-content ${FONT_SIZE_CLASSES[fontSize]}`}
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        ) : article.summary ? (
          <p className={`font-serif ${FONT_SIZE_CLASSES[fontSize]} text-text-default tracking-[0.02em]`}>
            {article.summary}
          </p>
        ) : !embedInfo ? (
          <div className="text-center py-12">
            <p className="text-[12px] text-text-faint mb-4 tracking-[0.04em]">本文のプレビューはありません</p>
            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-text-soft hover:text-text-default tracking-[0.06em] underline-offset-4 hover:underline transition-all duration-200"
              >
                元記事を開く
              </a>
            )}
          </div>
        ) : null}

        {/* 全文取得ボタン */}
        {canFetch && (
          <div className="mt-6 pt-6 border-t border-border-subtle flex flex-col items-center gap-2">
            <button
              onClick={fetchFullContent}
              disabled={fetching}
              className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] px-4 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200 disabled:opacity-50"
            >
              {fetching ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  取得中...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  全文を取得
                </>
              )}
            </button>
            {fetchError && (
              <p className="text-[11px] text-rose-400">{fetchError}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
