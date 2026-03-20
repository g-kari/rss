import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Article } from '../types';

type AiMode = 'summary' | 'translation';

interface Props {
  article: Article | null;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
}

interface EmbedInfo {
  embedUrl: string;
  type: 'video' | 'audio';
  audioHeight?: number;
  allow: string;
}

/** 埋め込み可能なサービスの URL パターンマッチ */
function extractEmbedInfo(url: string): EmbedInfo | null {
  const ALLOW_VIDEO = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  const ALLOW_AUDIO = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';

  // YouTube
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (yt) return {
    embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}?origin=https://rss.0g0.xyz`,
    type: 'video',
    allow: ALLOW_VIDEO,
  };

  // Vimeo
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim) return {
    embedUrl: `https://player.vimeo.com/video/${vim[1]}`,
    type: 'video',
    allow: 'autoplay; fullscreen; picture-in-picture',
  };

  // ニコニコ動画
  const nico = url.match(/nicovideo\.jp\/watch\/((?:sm|nm|so|lv)\d+|\d+)/);
  if (nico) return {
    embedUrl: `https://embed.nicovideo.jp/watch/${nico[1]}?autoplay=0`,
    type: 'video',
    allow: ALLOW_VIDEO,
  };

  // Twitch クリップ
  const twitchClip = url.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/);
  if (twitchClip) return {
    embedUrl: `https://clips.twitch.tv/embed?clip=${twitchClip[1]}&parent=rss.0g0.xyz`,
    type: 'video',
    allow: 'autoplay; fullscreen',
  };

  // Twitch チャンネル / VOD
  const twitchVideo = url.match(/twitch\.tv\/videos\/(\d+)/);
  if (twitchVideo) return {
    embedUrl: `https://player.twitch.tv/?video=${twitchVideo[1]}&parent=rss.0g0.xyz`,
    type: 'video',
    allow: 'autoplay; fullscreen',
  };
  const twitchCh = url.match(/twitch\.tv\/([A-Za-z0-9_]+)$/);
  if (twitchCh) return {
    embedUrl: `https://player.twitch.tv/?channel=${twitchCh[1]}&parent=rss.0g0.xyz`,
    type: 'video',
    allow: 'autoplay; fullscreen',
  };

  // Spotify
  const spotify = url.match(
    /open\.spotify\.com\/(track|album|playlist|episode|artist)\/([A-Za-z0-9]+)/,
  );
  if (spotify) {
    const isShort = spotify[1] === 'track' || spotify[1] === 'episode';
    return {
      embedUrl: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`,
      type: 'audio',
      audioHeight: isShort ? 152 : 380,
      allow: ALLOW_AUDIO,
    };
  }

  return null;
}

/** RSS コンテンツ内の iframe をレスポンシブラッパーで包む（YouTube origin のみ） */
function processContent(html: string): string {
  return html.replace(
    /<iframe([^>]*src=["'][^"']*(?:youtube(?:-nocookie)?\.com\/embed)[^"']*["'][^>]*)>([\s\S]*?)<\/iframe>/gi,
    (_match, attrs, inner) =>
      `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.25em 0;border-radius:8px">` +
      `<iframe${attrs} style="position:absolute;top:0;left:0;width:100%;height:100%;border:0">${inner}</iframe>` +
      `</div>`,
  );
}

/** 埋め込み表示する場合、コンテンツ内の iframe を除去（二重埋め込み防止） */
function stripIframes(html: string): string {
  return html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
}

/* ── 全文キャッシュ (localStorage) ── */
const CACHE_PREFIX = 'rss-content:';
const CACHE_MAX = 15;

function loadCache(id: string): string | null {
  try { return localStorage.getItem(`${CACHE_PREFIX}${id}`); } catch { return null; }
}

function saveCache(id: string, content: string) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length >= CACHE_MAX) localStorage.removeItem(keys[0]);
    localStorage.setItem(`${CACHE_PREFIX}${id}`, content);
  } catch { /* storage full */ }
}

const SHORT_CONTENT_THRESHOLD = 400;

export default function ArticleView({ article, isBookmarked, onToggleBookmark }: Props) {
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

  // 記事が変わったら fetch 状態のみリセット（キャッシュは useMemo で自動更新）
  useEffect(() => {
    setFetchError('');
    setAiResult(null);
    setFetchedContent(null);
  }, [article?.id]);

  const runAi = useCallback(async (mode: AiMode, contentHtml: string) => {
    if (aiResult?.mode === mode) { setAiResult(null); return; }
    setAiLoading(mode);
    try {
      const endpoint = mode === 'summary' ? '/api/ai/summarize' : '/api/ai/translate';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: contentHtml }),
      });
      const data = await res.json<{ result?: string; error?: string }>();
      if (data.result) setAiResult({ mode, text: data.result });
    } finally {
      setAiLoading(null);
    }
  }, [aiResult]);

  async function fetchFullContent() {
    if (!article?.link) return;
    setFetching(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/content?url=${encodeURIComponent(article.link)}`);
      const data = await res.json<{ content?: string; error?: string }>();
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
      <main className="overflow-y-auto flex items-center justify-center bg-surface-base">
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

  return (
    <main className="overflow-y-auto bg-surface-elevated animate-fade-in">
      <div className="max-w-2xl mx-auto px-10 py-12">
        {/* メタ */}
        <div className="flex items-center gap-4 mb-5 text-[11px] text-text-muted">
          {article.publishedAt && (
            <time className="tracking-[0.04em]">
              {new Date(article.publishedAt).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
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

          {/* AI ボタン */}
          {hasContent && (
            <div className="ml-auto flex items-center gap-1">
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

          <button
            onClick={() => onToggleBookmark(article.id)}
            title={isBookmarked ? 'ブックマーク解除 (b)' : 'ブックマーク (b)'}
            className={`transition-colors duration-200 ${hasContent ? '' : 'ml-auto'} ${
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
            className="article-content"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        ) : article.summary ? (
          <p className="font-serif text-[16px] leading-[1.9] text-text-default tracking-[0.02em]">
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
