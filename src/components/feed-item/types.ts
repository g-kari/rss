import type { ReactNode } from "react";
import type { Feed, FeedGroup, FeedView, KeywordFilter } from "../../types";

// #1076: callback は feedId / feed を引数で受ける stable 参照に統一する。
// renderFeed が feed ごとに inline closure を生成すると memo(FeedItem) が shallow-equal で
// 無効化されゼロ効果になるため、parent の stable callback を直渡しして FeedItem 内で
// feed / feed.id を bind する設計 (useArticleListItemProps の resolveItemProps と同 pattern)。
export interface FeedItemProps {
  feed: Feed;
  count: number;
  isSelected: boolean;
  isPinned: boolean;
  animationIndex: number;
  lastPublishedAt?: string;
  onSelect: (feedId: string) => void;
  onMarkAllRead: (feedId: string) => void;
  onDelete: (feedId: string) => void;
  onTogglePin: (feedId: string) => void;
  onRename: (feedId: string, title: string) => Promise<void>;
  onRetry: (feedId: string) => Promise<void>;
  onReinfer?: (feedId: string) => Promise<void>;
  onFilterSave?: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
  onToggleNsfw?: (feed: Feed) => void;
  onTogglePriority?: (feed: Feed) => void;
  onSetCategory?: (feed: Feed, category: string | null) => Promise<void>;
  groups?: FeedGroup[];
  onSetGroup?: (feed: Feed, groupId: string | null) => Promise<void>;
  onMute?: (feed: Feed, mutedUntil: string | null) => Promise<void>;
  onSetView?: (feed: Feed, view: FeedView | null) => Promise<void>;
  onSetDigestLimit?: (feed: Feed, limit: number | null) => Promise<void>;
  onDragStartFeed?: (feedId: string) => void;
  onDragEndFeed?: () => void;
  isDragging?: boolean;
}

export interface Action {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  show?: boolean;
  variant?: "danger";
}
