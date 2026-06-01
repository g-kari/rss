"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "../../types";
import { FallbackImage } from "../FallbackImage";
import FooterIconButton from "./FooterIconButton";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  user: UserProfile;
  theme: "light" | "dark";
  importing: boolean;
  onImport: () => void;
  onShowReleaseNotes: () => void;
  onShowStats: () => void;
  onExportOpml: () => void;
  onExportMarkdown?: (mode: "bookmark" | "reading_list") => void;
  onExportNotes?: () => void;
  onExportReadwise?: () => void;
  noteCount?: number;
  install?: { canInstall: boolean; onInstall: () => void };
  push?: {
    supported: boolean;
    subscribed: boolean;
    loading: boolean;
    error: string | null;
    onToggle: () => void;
    onSendTest?: () => Promise<string>;
  };
  onShowFeedHealth: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  /** 今日の読了数（未定義時は非表示） */
  readTodayCount?: number;
  /** 週間目標件数（未定義時は目標なし表示） */
  weeklyGoal?: number;
}

export default function SidebarFooter({
  user,
  theme,
  importing,
  onImport,
  onShowReleaseNotes,
  onShowStats,
  onExportOpml,
  onExportMarkdown,
  onExportNotes,
  onExportReadwise,
  noteCount,
  install,
  push,
  onShowFeedHealth,
  onOpenSettings,
  onOpenHelp,
  onToggleTheme,
  onLogout,
  readTodayCount,
  weeklyGoal,
}: Props) {
  const { success, error: showError } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { menuRef, handleKeyDown } = useMenuKeyboard(moreOpen, setMoreOpen, buttonRef);

  // 「もっと見る」ドロップダウンの外クリックで閉じる
  useEffect(() => {
    if (!moreOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreOpen]);

  return (
    <div className="px-3 py-2.5 border-t border-border-subtle flex items-center gap-1">
      {user.picture ? (
        <FallbackImage
          url={user.picture}
          alt=""
          className="w-5 h-5 rounded-full flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-surface-subtle flex-shrink-0" />
      )}
      <span className="text-[11px] text-text-muted truncate flex-1">{user.name}</span>

      {/* 常時表示: 頻度の高いボタン群 */}
      <FooterIconButton onClick={onShowStats} title="読書統計">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </FooterIconButton>

      {/* Push通知ボタン (右クリックでテスト送信 → Toast化 #454) */}
      {push?.supported && (
        <button
          onClick={push.onToggle}
          onContextMenu={(e) => {
            if (!push.subscribed || !push.onSendTest) return;
            e.preventDefault();
            void push
              .onSendTest()
              .then((msg) => success(msg))
              .catch((err: unknown) => {
                showError(err instanceof Error ? err.message : "テスト送信に失敗しました");
              });
          }}
          disabled={push.loading}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded transition-colors duration-200 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${push.error ? "text-error" : push.subscribed ? "text-accent-dot" : "text-text-faint hover:text-text-muted"} disabled:opacity-50`}
          title={
            push.error ??
            (push.subscribed ? "プッシュ通知をオフ (右クリックでテスト送信)" : "プッシュ通知をオン")
          }
          aria-label={push.error ?? (push.subscribed ? "プッシュ通知をオフ" : "プッシュ通知をオン")}
          aria-pressed={push.subscribed}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            {push.subscribed ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.143 17.082a24.248 24.248 0 003.844.148m-3.844-.148a23.856 23.856 0 01-5.455-1.31 8.964 8.964 0 002.3-5.542m3.155 6.852a3 3 0 005.667 1.97m1.965-2.277L21 21m-4.225-4.225a23.81 23.81 0 003.536-1.003A8.967 8.967 0 0018 9.75V9A6 6 0 006.53 6.53m10.245 10.245L6.53 6.53M3 3l3.53 3.53"
              />
            )}
          </svg>
        </button>
      )}

      <FooterIconButton onClick={onOpenSettings} title="ユーザー設定">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </FooterIconButton>

      <FooterIconButton onClick={onOpenHelp} title="キーボードショートカット (?)">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.5M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
        />
      </FooterIconButton>

      {readTodayCount !== undefined && (
        <span className="text-[10px] text-text-muted tabular-nums" title="今日の読了数 / 週間目標">
          今日 {readTodayCount}
          {weeklyGoal ? "/" + weeklyGoal : ""}件
        </span>
      )}

      <FooterIconButton
        onClick={onToggleTheme}
        title={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
      >
        {theme === "dark" ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
          />
        )}
      </FooterIconButton>

      {/* 「もっと見る」ドロップダウン（低頻度ボタン群 #454） */}
      <div className="relative flex-shrink-0" ref={moreRef}>
        <button
          ref={buttonRef}
          onClick={() => setMoreOpen((v) => !v)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded"
          title="その他のメニュー"
          aria-label="その他のメニュー"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
        </button>

        {moreOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="その他のメニュー"
            className="absolute bottom-full right-0 mb-1 w-52 bg-surface-elevated border border-border-default rounded-lg shadow-lg py-1 z-50"
            onKeyDown={handleKeyDown}
          >
            {/* OPMLインポート */}
            <button
              onClick={() => {
                onImport();
                setMoreOpen(false);
              }}
              disabled={importing}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover disabled:opacity-40 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              OPML インポート
            </button>

            {/* OPMLエクスポート */}
            <button
              onClick={() => {
                onExportOpml();
                setMoreOpen(false);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              OPML エクスポート
            </button>

            {/* Markdownエクスポート */}
            {onExportMarkdown && (
              <>
                <button
                  onClick={() => {
                    onExportMarkdown("bookmark");
                    setMoreOpen(false);
                  }}
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  ブックマーク → Markdown
                </button>
                <button
                  onClick={() => {
                    onExportMarkdown("reading_list");
                    setMoreOpen(false);
                  }}
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  後で読む → Markdown
                </button>
              </>
            )}

            {/* メモエクスポート */}
            {onExportNotes && (noteCount ?? 0) > 0 && (
              <button
                onClick={() => {
                  onExportNotes();
                  setMoreOpen(false);
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                  />
                </svg>
                メモを Markdown で出力 ({noteCount}件)
              </button>
            )}

            {/* Readwise CSV エクスポート */}
            {onExportReadwise && (noteCount ?? 0) > 0 && (
              <button
                onClick={() => {
                  onExportReadwise();
                  setMoreOpen(false);
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                メモを Readwise CSV で出力 ({noteCount}件)
              </button>
            )}

            {/* フィードヘルス */}
            <button
              onClick={() => {
                onShowFeedHealth();
                setMoreOpen(false);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
              フィードヘルス
            </button>

            {/* リリースノート */}
            <button
              onClick={() => {
                onShowReleaseNotes();
                setMoreOpen(false);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              リリースノート
            </button>

            {/* PWAインストール */}
            {install?.canInstall && (
              <button
                onClick={() => {
                  install.onInstall();
                  setMoreOpen(false);
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-default hover:bg-surface-hover transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5"
                  />
                </svg>
                アプリをインストール
              </button>
            )}

            <div className="border-t border-border-subtle my-1" />

            {/* ログアウト */}
            <button
              onClick={() => {
                onLogout();
                setMoreOpen(false);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-soft hover:text-text-default hover:bg-surface-hover transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              ログアウト
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
