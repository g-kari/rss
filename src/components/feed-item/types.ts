import type { Feed, FeedGroup, FeedView, KeywordFilter } from "../../types";

export interface FeedItemProps {
  feed: Feed;
  count: number;
  isSelected: boolean;
  isPinned: boolean;
  animationIndex: number;
  lastPublishedAt?: string;
  onSelect: () => void;
  onMarkAllRead: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onRename: (title: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onReinfer?: () => Promise<void>;
  onFilterSave?: (filter: KeywordFilter | null) => Promise<void>;
  onToggleNsfw?: () => void;
  onTogglePriority?: () => void;
  onSetCategory?: (category: string | null) => Promise<void>;
  groups?: FeedGroup[];
  onSetGroup?: (groupId: string | null) => Promise<void>;
  onMute?: (mutedUntil: string | null) => Promise<void>;
  onSetView?: (view: FeedView | null) => Promise<void>;
  onDragStartFeed?: (feedId: string) => void;
  onDragEndFeed?: () => void;
  isDragging?: boolean;
}

export interface Action {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  show?: boolean;
  variant?: "danger";
}
