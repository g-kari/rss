'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import FeedSidebar from './components/FeedSidebar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import type { Article, Layout } from './types';
import { useAuth } from './hooks/useAuth';
import { useFeeds } from './hooks/useFeeds';
import { useKeyboardNav } from './hooks/useKeyboardNav';

type Theme = 'light' | 'dark';
type FontSize = 'small' | 'medium' | 'large';
type MobilePane = 'sidebar' | 'list' | 'view';

function loadSet(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

function loadLayout(): Layout {
  const stored = localStorage.getItem('rss-layout');
  if (stored === 'compact' || stored === 'list' || stored === 'card' || stored === 'magazine')
    return stored;
  return 'list';
}

function loadTheme(): Theme {
  const stored = localStorage.getItem('rss-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadFontSize(): FontSize {
  const stored = localStorage.getItem('rss-font-size');
  if (stored === 'small' || stored === 'medium' || stored === 'large') return stored;
  return 'medium';
}

const loadReadIds = () => loadSet('rss-read');
const loadBookmarkIds = () => loadSet('rss-bookmarks');

export default function App() {
  const { user, betaRestricted } = useAuth();
  const { feeds, articles, loadingArticles, refreshing, newArticleCount, onFeedAdded, removeFeed, replaceFeeds, refreshFeeds, dismissNewArticles } = useFeeds(user);

  const [readIds, setReadIds] = useState<Set<string>>(loadReadIds);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(loadBookmarkIds);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [fontSize, setFontSize] = useState<FontSize>(loadFontSize);
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [mobilePane, setMobilePane] = useState<MobilePane>('sidebar');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rss-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const onChangeFontSize = useCallback((size: FontSize) => {
    setFontSize(size);
    localStorage.setItem('rss-font-size', size);
  }, []);

  const onChangeLayout = useCallback((l: Layout) => {
    setLayout(l);
    localStorage.setItem('rss-layout', l);
  }, []);

  const markRead = useCallback((articleId: string) => {
    setReadIds((prev) => {
      const next = new Set(prev).add(articleId);
      saveSet('rss-read', next);
      return next;
    });
  }, []);

  const markAllRead = useCallback((feedId: string | null) => {
    setReadIds((prev) => {
      let ids: string[];
      if (feedId === '__bookmarks__') {
        ids = articles.filter((a) => bookmarkIds.has(a.id)).map((a) => a.id);
      } else if (feedId) {
        ids = articles.filter((a) => a.feedId === feedId).map((a) => a.id);
      } else {
        ids = articles.map((a) => a.id);
      }
      const next = new Set([...prev, ...ids]);
      saveSet('rss-read', next);
      return next;
    });
  }, [articles, bookmarkIds]);

  const toggleRead = useCallback((articleId: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.has(articleId) ? next.delete(articleId) : next.add(articleId);
      saveSet('rss-read', next);
      return next;
    });
  }, []);

  const toggleBookmark = useCallback((articleId: string) => {
    setBookmarkIds((prev) => {
      const next = new Set(prev);
      next.has(articleId) ? next.delete(articleId) : next.add(articleId);
      saveSet('rss-bookmarks', next);
      return next;
    });
  }, []);

  function onFeedDeleted(id: string) {
    removeFeed(id);
    if (selectedFeedId === id) {
      setSelectedFeedId(null);
      setSelectedArticle(null);
    }
  }

  const bookmarkCount = useMemo(
    () => articles.filter((a) => bookmarkIds.has(a.id)).length,
    [articles, bookmarkIds],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') setShowHelp((v) => !v);
      if (e.key === 'Escape') setShowHelp(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useKeyboardNav({
    articles,
    selectedFeedId,
    selectedArticle,
    bookmarkIds,
    readIds,
    setSelectedArticle,
    markRead,
    markAllRead,
    toggleBookmark,
    toggleRead,
  });

  // ローディング
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
      </div>
    );
  }

  // ベータ制限
  if (betaRestricted) {
    return (
      <div className="min-h-screen bg-surface-base font-sans antialiased flex flex-col items-center justify-center px-8 text-center">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mb-6 text-text-faint">
          <rect width="40" height="40" rx="10" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1"/>
          <path d="M20 12v9M20 27v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        <p className="text-[11px] tracking-[0.3em] uppercase text-text-faint mb-4">Beta Access</p>
        <h1 className="text-[28px] font-light text-text-strong tracking-[-0.01em] mb-3">
          現在クローズドベータ中です
        </h1>
        <p className="text-[14px] text-text-muted leading-relaxed max-w-xs mb-8">
          このサービスは招待制のベータ版です。<br />アクセス権限をお持ちでない場合はご連絡ください。
        </p>
        <a
          href="/api/auth/login"
          className="text-[12px] tracking-[0.06em] px-5 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
        >
          別のアカウントでログイン
        </a>
      </div>
    );
  }

  // 未ログイン — Landing Page
  if (!user) {
    return (
      <div className="min-h-screen bg-surface-base font-sans antialiased flex flex-col">
        {/* ヘッダー */}
        <header className="px-8 py-4 flex items-center justify-between border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-text-strong">
              <rect width="22" height="22" rx="5" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.8"/>
              <circle cx="6" cy="16" r="2.5" fill="currentColor"/>
              <path d="M6 10.5 A5.5 5.5 0 0 1 11.5 16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
              <path d="M6 5.5 A10.5 10.5 0 0 1 16.5 16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
            <span className="text-[13px] font-medium tracking-[0.04em] text-text-strong">RSS Reader</span>
          </div>
          <a
            href="/api/auth/login"
            className="text-[12px] tracking-[0.06em] px-4 py-1.5 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
          >
            ログイン
          </a>
        </header>

        {/* ヒーロー */}
        <main className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center">
          <p className="text-[11px] tracking-[0.3em] uppercase text-text-faint mb-8 animate-fade-up">
            rss.0g0.xyz
          </p>
          <h1
            className="text-[52px] sm:text-[64px] font-light text-text-strong tracking-[-0.02em] leading-[1.1] mb-5 animate-fade-up"
            style={{ animationDelay: '60ms' }}
          >
            シンプルな<br />RSS リーダー
          </h1>
          <p
            className="text-[16px] text-text-muted leading-relaxed mb-10 max-w-sm animate-fade-up"
            style={{ animationDelay: '120ms' }}
          >
            AI 要約・翻訳、4 種のレイアウト、<br />ダーク / ライトテーマ対応
          </p>
          <a
            href="/api/auth/login"
            className="animate-fade-up inline-flex items-center gap-2 px-8 py-3 bg-ink hover:bg-ink-hover text-ink-text text-[13px] tracking-[0.06em] rounded-full transition-all duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
            style={{ animationDelay: '180ms' }}
          >
            0g0 ID でログイン
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 7h10M8 3l4 4-4 4"/>
            </svg>
          </a>
        </main>

        {/* 機能カード */}
        <section className="px-8 pb-16 w-full max-w-2xl mx-auto animate-fade-up" style={{ animationDelay: '240ms' }}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: '◐', title: 'テーマ', desc: 'ダーク / ライト' },
              { icon: '⊞', title: 'レイアウト', desc: '4 種類' },
              { icon: '✦', title: 'AI 機能', desc: '要約・翻訳' },
            ].map((f) => (
              <div
                key={f.title}
                className="px-4 py-4 rounded-xl border border-border-default bg-surface-elevated text-center"
              >
                <div className="text-[20px] mb-2 text-text-muted">{f.icon}</div>
                <div className="text-[13px] font-medium text-text-strong mb-0.5">{f.title}</div>
                <div className="text-[11px] text-text-faint">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* フッター */}
        <footer className="px-8 py-4 text-center text-[11px] text-text-faint border-t border-border-subtle">
          rss.0g0.xyz — Powered by Cloudflare Workers
        </footer>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen font-sans antialiased bg-surface-base text-text-strong lg:grid"
      style={{ gridTemplateColumns: '200px 360px 1fr', gridTemplateRows: '100%' }}
    >
      {/* キーボードショートカット ヘルプ */}
      {showHelp && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-surface-elevated border border-border-default rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.2)] p-6 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">キーボードショートカット</span>
              <button
                onClick={() => setShowHelp(false)}
                className="text-text-faint hover:text-text-muted transition-colors"
                aria-label="閉じる"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 2l10 10M12 2L2 12"/>
                </svg>
              </button>
            </div>
            <ul className="space-y-2">
              {[
                ['j / ↓', '次の記事'],
                ['k / ↑', '前の記事'],
                ['n', '次の未読記事へ'],
                ['p', '前の未読記事へ'],
                ['o', '元記事を開く'],
                ['b', 'ブックマーク切替'],
                ['r', '既読 / 未読切替'],
                ['m', '全既読にする'],
                ['/', '記事を検索'],
                ['?', 'このヘルプを表示'],
              ].map(([key, desc]) => (
                <li key={key} className="flex items-center justify-between">
                  <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-muted">{key}</kbd>
                  <span className="text-[12px] text-text-soft">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {newArticleCount > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-ink text-ink-text text-[12px] tracking-[0.03em] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2)] animate-fade-up">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />
          新着記事 {newArticleCount} 件
          <button
            onClick={dismissNewArticles}
            className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="通知を閉じる"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8"/>
            </svg>
          </button>
        </div>
      )}
      <div className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== 'sidebar' ? 'hidden lg:block' : ''}`}>
        <FeedSidebar
          feeds={feeds}
          articles={articles}
          readIds={readIds}
          bookmarkCount={bookmarkCount}
          selectedFeedId={selectedFeedId}
          user={user}
          theme={theme}
          onSelectFeed={(id) => {
            setSelectedFeedId(id);
            setSelectedArticle(null);
            setMobilePane('list');
          }}
          onFeedAdded={onFeedAdded}
          onFeedDeleted={onFeedDeleted}
          onFeedsImported={replaceFeeds}
          onMarkAllRead={markAllRead}
          onToggleTheme={toggleTheme}
          onRefresh={refreshFeeds}
          refreshing={refreshing}
        />
      </div>
      <div className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== 'list' ? 'hidden lg:block' : ''}`}>
        <ArticleList
          articles={articles}
          feeds={feeds}
          feedId={selectedFeedId}
          readIds={readIds}
          bookmarkIds={bookmarkIds}
          selectedArticleId={selectedArticle?.id ?? null}
          layout={layout}
          loading={loadingArticles}
          onChangeLayout={onChangeLayout}
          onMobileBack={() => setMobilePane('sidebar')}
          onSelectArticle={(article) => {
            setSelectedArticle(article);
            markRead(article.id);
            setMobilePane('view');
          }}
        />
      </div>
      <div className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden ${mobilePane !== 'view' ? 'hidden lg:block' : ''}`}>
        <ArticleView
          article={selectedArticle}
          isBookmarked={selectedArticle ? bookmarkIds.has(selectedArticle.id) : false}
          onToggleBookmark={toggleBookmark}
          onMobileBack={() => setMobilePane('list')}
          fontSize={fontSize}
          onChangeFontSize={onChangeFontSize}
        />
      </div>
    </div>
  );
}
