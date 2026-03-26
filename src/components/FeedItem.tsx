'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { Feed } from '../types';

/** 未読カウントを表示用文字列に変換する（100以上は "99+" と表示） */
export function formatCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

export interface FeedItemProps {
  feed: Feed;
  count: number;
  isSelected: boolean;
  isPinned: boolean;
  animationIndex: number;
  onSelect: () => void;
  onMarkAllRead: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onRename: (title: string) => Promise<void>;
  onRetry: () => Promise<void>;
}

export default function FeedItem({ feed, count, isSelected, isPinned, animationIndex, onSelect, onMarkAllRead, onDelete, onTogglePin, onRename, onRetry }: FeedItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(feed.title || feed.url);
    setEditing(true);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  }, [feed.title, feed.url]);

  const commitEdit = useCallback(async () => {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === (feed.title || feed.url)) return;
    await onRename(trimmed);
  }, [editTitle, feed.title, feed.url, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void commitEdit(); }
    if (e.key === 'Escape') { setEditing(false); }
  }, [commitEdit]);

  const handleRetry = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry, retrying]);

  // メニュー外タップで閉じる
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  return (
    <div
      ref={menuRef}
      onClick={editing ? undefined : onSelect}
      onDoubleClick={editing ? undefined : startEdit}
      className={`group relative flex items-center justify-between px-4 py-1.5 cursor-pointer transition-all duration-200 animate-fade-up ${
        isSelected
          ? 'text-text-strong bg-surface-subtle'
          : 'text-text-muted hover:text-text-strong hover:bg-surface-hover'
      }`}
      style={{ animationDelay: `${animationIndex * 40}ms` }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => { void commitEdit(); }}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-[13px] bg-surface-base border border-border-default rounded px-1.5 py-0.5 text-text-strong outline-none focus:border-text-muted min-w-0"
        />
      ) : (
        <div className="flex-1 min-w-0">
          <span className="text-[13px] tracking-[0.02em] truncate block" title="ダブルクリックでタイトルを編集">{feed.title || feed.url}</span>
          {feed.fetchError && (
            <span className="text-[10px] text-rose-400 truncate block leading-tight mt-0.5">
              {(feed.consecutiveErrors ?? 0) >= 5 ? '更新停止 · ' : ''}{feed.fetchError}
            </span>
          )}
        </div>
      )}
      <span className="flex items-center gap-1 ml-1 flex-shrink-0">
        {count > 0 && (
          <span className={`text-[11px] ${feed.fetchError ? 'text-rose-400' : 'text-text-muted'} tabular-nums group-hover:opacity-0 transition-opacity duration-150 ${menuOpen ? 'opacity-0' : ''}`}>{formatCount(count)}</span>
        )}

        {/* デスクトップ: ホバーで表示するアクションボタン群 */}
        <span className={`opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 flex items-center gap-0.5 ${menuOpen ? '!opacity-0 !pointer-events-none' : ''}`}>
          <button
            onClick={onTogglePin}
            className={`p-0.5 transition-colors duration-150 ${isPinned ? 'text-text-default' : 'text-text-faint hover:text-text-default'}`}
            title={isPinned ? 'ピン解除' : 'ピン留め'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 1L6.5 4H9L7 6l.5 3L5 7.5 2.5 9 3 6 1 4h2.5z" />
            </svg>
          </button>
          {count > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkAllRead(); }}
              className="p-0.5 text-text-faint hover:text-text-default transition-colors duration-150"
              title="全て既読"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 5l2.5 2.5L8.5 2.5" />
              </svg>
            </button>
          )}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className={`p-0.5 transition-colors duration-150 disabled:opacity-40 ${feed.fetchError ? 'text-rose-400 hover:text-rose-300' : 'text-text-faint hover:text-text-default'}`}
            title={feed.fetchError ? '再試行' : '更新'}
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className={retrying ? 'animate-spin' : ''}
            >
              <path d="M8.5 2A4 4 0 1 0 9 5.5" />
              <polyline points="7,0.5 8.5,2 7,3.5" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-0.5 text-text-faint hover:text-rose-400 transition-colors duration-150"
            title="削除"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        </span>

        {/* モバイル用 ⋮ ボタン (lg 以上では非表示) */}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="lg:hidden p-1 -mr-1 text-text-faint transition-colors duration-150"
          title="操作メニュー"
          aria-label="操作メニューを開く"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="2" r="1.2" />
            <circle cx="6" cy="6" r="1.2" />
            <circle cx="6" cy="10" r="1.2" />
          </svg>
        </button>
      </span>

      {/* モバイル用ドロップダウンメニュー */}
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-full z-20 mt-0.5 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[120px]"
        >
          <button
            onClick={(e) => { setMenuOpen(false); onTogglePin(e); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 1L6.5 4H9L7 6l.5 3L5 7.5 2.5 9 3 6 1 4h2.5z" />
            </svg>
            {isPinned ? 'ピン解除' : 'ピン留め'}
          </button>
          {count > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMarkAllRead(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 5l2.5 2.5L8.5 2.5" />
              </svg>
              全て既読
            </button>
          )}
          <button
            onClick={(e) => { setMenuOpen(false); void handleRetry(e); }}
            disabled={retrying}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-surface-subtle transition-colors text-left disabled:opacity-40 ${feed.fetchError ? 'text-rose-400' : 'text-text-default'}`}
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className={retrying ? 'animate-spin' : ''}
            >
              <path d="M8.5 2A4 4 0 1 0 9 5.5" />
              <polyline points="7,0.5 8.5,2 7,3.5" />
            </svg>
            {feed.fetchError ? '再試行' : '更新'}
          </button>
          <button
            onClick={(e) => { setMenuOpen(false); onDelete(e); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-rose-400 hover:bg-surface-subtle transition-colors text-left"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
            削除
          </button>
        </div>
      )}
    </div>
  );
}
