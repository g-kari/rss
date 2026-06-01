"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { usePopupLock } from "../hooks/usePopupLock";

export default function SessionExpiredModal() {
  // #847: canonical focus trap (useModalFocusTrap) に統合。
  // セッション切れモーダルは閉じる手段がない (login link のみ) ため、Escape は no-op
  // (onClose: () => {}) で渡して既存の「閉じない」挙動を維持する。
  // Tab cycle は dialog 内 focusable が login link 1 件のみのため、結果的に常に
  // login link へ wrap される (旧手書き実装と等価)。
  const dialogRef = useRef<HTMLDivElement>(null);
  const loginLinkRef = useRef<HTMLAnchorElement>(null);
  const { handleKeyDown } = useModalFocusTrap(dialogRef, {
    onClose: () => {},
    initialFocusRef: loginLinkRef,
  });

  // #1033: hasOpenPopup フラグを立てて ColumnResizeHandles 等の背景インタラクティブ要素を無効化
  usePopupLock();

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-desc"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="w-[360px] rounded-xl bg-surface-elevated border border-border-default shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-8 text-center">
        {/* Lock icon */}
        <div className="flex justify-center mb-5">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-muted"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2 id="session-expired-title" className="text-[16px] font-medium text-text-strong mb-2">
          セッションが期限切れになりました
        </h2>
        <p id="session-expired-desc" className="text-[13px] text-text-muted leading-relaxed mb-6">
          続行するには再度ログインしてください。
          <br />
          現在の表示内容は保持されます。
        </p>

        <a
          ref={loginLinkRef}
          href="/api/auth/login"
          className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-ink hover:bg-ink-hover text-ink-text text-[13px] font-medium rounded-lg transition-all duration-200"
        >
          ログイン
        </a>
      </div>
    </div>,
    document.body,
  );
}
