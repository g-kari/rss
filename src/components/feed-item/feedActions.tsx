"use client";

import type { Feed, FeedGroup, FeedView, KeywordFilter } from "../../types";
import { NsfwIcon, StarIcon, FilterIcon } from "../article-view/icons";
import type { Action } from "./types";

/**
 * `buildFeedActions` が必要とする props。
 * FeedItemComponent.tsx 内の actions 配列がクロージャ経由で参照していた値・ハンドラを集約する。
 */
export interface FeedActionBuilderProps {
  feed: Feed;
  count: number;
  isPinned: boolean;
  isMuted: boolean;
  hasFilter: boolean;
  loadingAction: "retry" | "reinfer" | null;
  groups?: FeedGroup[];
  onCopyUrl: () => void;
  onCopySiteUrl: () => void;

  // 任意ハンドラ（未指定なら該当 action は show:false）
  onTogglePriority?: () => void;
  onToggleNsfw?: () => void;
  onFilterSave?: (filter: KeywordFilter | null) => Promise<void>;
  onSetCategory?: (category: string | null) => Promise<void>;
  onSetGroup?: (groupId: string | null) => Promise<void>;
  onSetView?: (view: FeedView | null) => Promise<void>;
  onSetDigestLimit?: (limit: number | null) => Promise<void>;
  onMute?: (mutedUntil: string | null) => Promise<void>;
  onReinfer?: () => Promise<void>;

  // FeedItem 内の状態を更新する setter / ハンドラ
  setMenuOpen: (open: boolean) => void;
  setDetailOpen: (open: boolean) => void;
  setFilterModalOpen: (open: boolean) => void;
  startCategoryEdit: () => void;
  setGroupOpen: (open: boolean) => void;
  setViewOpen: (open: boolean) => void;
  setDigestOpen: (open: boolean) => void;
  setMuteOpen: (open: boolean) => void;
  onTogglePin: () => void;
  onMarkAllRead: () => void;
  handleRetry: () => void;
  handleReinfer: () => Promise<void> | void;
  onDelete: () => void;

  /**
   * 削除確認ダイアログを表示し、ユーザーが許可したかを返す。
   * FeedItem 側の `useConfirm` を呼び出すコールバックを差し込むことで、ビュー層のフックを切り離す。
   */
  confirmDelete: () => Promise<boolean>;
}

/**
 * FeedItem のドロップダウン / コンテキストメニューに並ぶ操作 actions を構築する。
 *
 * 動作・順序・条件は元の `FeedItemComponent.tsx` の `actions: Action[]` リテラルから完全に保持。
 * 戻り値の `show: false` のものは呼び出し側（visibleActions = filter(...)）でフィルタリングされる。
 */
export function buildFeedActions(props: FeedActionBuilderProps): Action[] {
  const {
    feed,
    count,
    isPinned,
    isMuted,
    hasFilter,
    loadingAction,
    groups,
    onTogglePriority,
    onToggleNsfw,
    onFilterSave,
    onSetCategory,
    onSetGroup,
    onSetView,
    onSetDigestLimit,
    onMute,
    onReinfer,
    onCopyUrl,
    onCopySiteUrl,
    setMenuOpen,
    setDetailOpen,
    setFilterModalOpen,
    startCategoryEdit,
    setGroupOpen,
    setViewOpen,
    setDigestOpen,
    setMuteOpen,
    onTogglePin,
    onMarkAllRead,
    handleRetry,
    handleReinfer,
    onDelete,
    confirmDelete,
  } = props;

  return [
    {
      key: "detail",
      label: "詳細を見る",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="5" cy="5" r="4" />
          <line x1="5" y1="4" x2="5" y2="7" />
          <circle cx="5" cy="2.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      ),
      onClick: () => setDetailOpen(true),
      className: "text-text-faint hover:text-text-default",
    },
    {
      key: "copy-url",
      label: "フィード URL をコピー",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5.8 3.2l1-1a2 2 0 012.8 2.8l-2 2a2 2 0 01-2.8 0" />
          <path d="M4.2 6.8l-1 1A2 2 0 01.4 5l2-2a2 2 0 012.8 0" />
        </svg>
      ),
      onClick: onCopyUrl,
      className: "text-text-faint hover:text-text-default",
    },
    {
      key: "copy-site-url",
      label: "サイト URL をコピー",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5.8 3.2l1-1a2 2 0 012.8 2.8l-2 2a2 2 0 01-2.8 0" />
          <path d="M4.2 6.8l-1 1A2 2 0 01.4 5l2-2a2 2 0 012.8 0" />
        </svg>
      ),
      onClick: onCopySiteUrl,
      show: feed.siteUrl !== "",
      className: "text-text-faint hover:text-text-default",
    },
    {
      key: "priority",
      label: feed.priority === "high" ? "スター解除" : "スター付き",
      icon: <StarIcon filled={feed.priority === "high"} />,
      onClick: () => onTogglePriority?.(),
      show: !!onTogglePriority,
      className:
        feed.priority === "high"
          ? "text-feed-star hover:text-feed-star-hover"
          : "text-text-faint hover:text-text-default",
    },
    {
      key: "nsfw",
      label: feed.nsfw ? "NSFW解除" : "NSFW設定",
      icon: <NsfwIcon />,
      onClick: () => onToggleNsfw?.(),
      show: !!onToggleNsfw,
      className: feed.nsfw
        ? "text-error hover:text-error-hover"
        : "text-text-faint hover:text-text-default",
    },
    {
      key: "filter",
      label: hasFilter ? "フィルター設定中" : "キーワードフィルター",
      icon: <FilterIcon />,
      onClick: () => setFilterModalOpen(true),
      show: !!onFilterSave,
      className: hasFilter ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "category",
      label: feed.category ? `カテゴリ: ${feed.category}` : "カテゴリを設定",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1 2.5h4l1 1.5-1 1.5H1z" />
          <line x1="6" y1="4" x2="9" y2="4" />
        </svg>
      ),
      onClick: () => {
        setMenuOpen(false);
        startCategoryEdit();
      },
      show: !!onSetCategory,
      className: feed.category ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "group",
      label: (() => {
        const current = groups?.find((g) => g.id === feed.groupId);
        return current ? `グループ: ${current.name}` : "グループに移動";
      })(),
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="1" y="2" width="8" height="6" rx="1" />
          <line x1="1" y1="4" x2="9" y2="4" />
        </svg>
      ),
      onClick: () => {
        setMenuOpen(false);
        setGroupOpen(true);
      },
      show: !!onSetGroup,
      className: feed.groupId ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "view",
      label: (() => {
        const labelMap: Record<FeedView, string> = {
          articles: "記事",
          pictures: "画像",
          videos: "動画",
          social: "SNS",
        };
        const v = feed.view ?? "articles";
        return `表示: ${labelMap[v]}`;
      })(),
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="1" y="1.5" width="8" height="7" rx="1" />
          <line x1="1" y1="4" x2="9" y2="4" />
        </svg>
      ),
      onClick: () => {
        setMenuOpen(false);
        setViewOpen(true);
      },
      show: !!onSetView,
      className: feed.view ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "digest",
      label: (() => {
        if (feed.digestLimit === undefined) return "ダイジェスト: デフォルト";
        if (feed.digestLimit === 0) return "ダイジェスト: 全件";
        return `ダイジェスト: ${feed.digestLimit}件`;
      })(),
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="1" y1="2.5" x2="9" y2="2.5" />
          <line x1="1" y1="5" x2="7" y2="5" />
          <line x1="1" y1="7.5" x2="5" y2="7.5" />
        </svg>
      ),
      onClick: () => {
        setMenuOpen(false);
        setDigestOpen(true);
      },
      show: !!onSetDigestLimit,
      className:
        feed.digestLimit !== undefined
          ? "text-text-default"
          : "text-text-faint hover:text-text-default",
    },
    {
      key: "mute",
      label: isMuted ? "ミュート解除" : "ミュート",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {isMuted ? (
            <>
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          ) : (
            <>
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M23 9l-6 6M17 9l6 6" opacity="0" />
              <line x1="1" y1="1" x2="23" y2="23" opacity="0" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </>
          )}
        </svg>
      ),
      onClick: () => {
        if (isMuted) {
          void onMute?.(null);
        } else {
          setMenuOpen(false);
          setMuteOpen(true);
        }
      },
      show: !!onMute,
      className: isMuted
        ? "text-feed-mute hover:text-feed-mute-hover"
        : "text-text-faint hover:text-text-default",
    },
    {
      key: "pin",
      label: isPinned ? "ピン解除" : "ピン留め",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill={isPinned ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 1L6.5 4H9L7 6l.5 3L5 7.5 2.5 9 3 6 1 4h2.5z" />
        </svg>
      ),
      onClick: () => onTogglePin(),
      className: isPinned ? "text-text-default" : "text-text-faint hover:text-text-default",
    },
    {
      key: "read",
      label: "全て既読",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1.5 5l2.5 2.5L8.5 2.5" />
        </svg>
      ),
      onClick: () => onMarkAllRead(),
      show: count > 0,
      className: "text-text-faint hover:text-text-default",
    },
    {
      key: "retry",
      label: feed.fetchError ? "再試行" : "更新",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={loadingAction === "retry" ? "animate-spin" : ""}
          aria-hidden="true"
        >
          <path d="M8.5 2A4 4 0 1 0 9 5.5" />
          <polyline points="7,0.5 8.5,2 7,3.5" />
        </svg>
      ),
      onClick: handleRetry,
      disabled: loadingAction === "retry",
      className: feed.fetchError
        ? "text-error hover:text-error-hover"
        : "text-text-faint hover:text-text-default",
      variant: feed.fetchError ? ("danger" as const) : undefined,
    },
    {
      key: "reinfer",
      label: loadingAction === "reinfer" ? "推論中..." : "セレクタを再推論",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={loadingAction === "reinfer" ? "animate-spin" : ""}
          aria-hidden="true"
        >
          <path d="M5 1a4 4 0 0 1 4 4" />
          <path d="M9 5a4 4 0 0 1-4 4" />
          <path d="M5 9a4 4 0 0 1-4-4" />
          <path d="M1 5a4 4 0 0 1 4-4" />
        </svg>
      ),
      onClick: () => void handleReinfer(),
      disabled: loadingAction === "reinfer",
      show: feed.isScraping && !!onReinfer,
      className: "text-text-faint hover:text-text-default",
    },
    {
      key: "delete",
      label: "削除",
      icon: (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      ),
      onClick: async () => {
        const ok = await confirmDelete();
        if (ok) onDelete();
      },
      className: "text-text-faint hover:text-error",
      variant: "danger" as const,
    },
  ];
}
