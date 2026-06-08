"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Feed, FeedGroup, FeedView, Collection } from "../types";

export interface FeedSidebarActions {
  onSelectFeed: (id: string | null) => void;
  onSelectGroup: (id: string | null) => void;
  onSelectTag: (tag: string | null) => void;
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onFeedsImported: (feeds: Feed[]) => void;
  onMarkAllRead: (feedId: string | null) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onSaveArticleUrl: (url: string, mode: "bookmark" | "reading_list") => Promise<void>;
  onRefresh: () => void;
  onRetryFeed: (id: string) => Promise<void>;
  onReinferFeed?: (id: string) => Promise<void>;
  onTogglePinFeed: (id: string) => void;
  onToggleCollapseCategory?: (category: string) => void;
  onActivateNsfw: () => void;
  onDeactivateNsfw: () => void;
  onToggleNsfwFeed: (feed: Feed) => void;
  onTogglePriorityFeed: (feed: Feed) => void;
  onSetCategoryFeed?: (feed: Feed, category: string | null) => Promise<void>;
  onSetGroupFeed?: (feed: Feed, groupId: string | null) => Promise<void>;
  onCreateFeedGroup?: (name: string) => Promise<FeedGroup | { error: string }>;
  onRenameFeedGroup?: (id: string, name: string) => Promise<FeedGroup | { error: string }>;
  onDeleteFeedGroup?: (id: string) => Promise<boolean>;
  onToggleCollapseFeedGroup?: (id: string, collapsed: boolean) => Promise<void>;
  onToggleMuteFeedGroup?: (id: string, muted: boolean) => Promise<void>;
  onReorderFeedGroup?: (id: string, direction: "up" | "down") => Promise<void>;
  onMarkAllReadInGroup?: (feedIds: string[]) => void;
  onMuteFeed?: (feed: Feed, mutedUntil: string | null) => Promise<void>;
  onSetFeedView?: (feed: Feed, view: FeedView | null) => Promise<void>;
  onSetDigestLimit?: (feed: Feed, limit: number | null) => Promise<void>;
  onChangeActiveFeedView: (view: FeedView) => void;
  onDismissRecommendation?: (id: string) => void;
  onRefreshRecommendations?: () => void;
  onExportMarkdown?: (mode: "bookmark" | "reading_list") => void;
  onExportJson?: (mode: "bookmark" | "reading_list") => void;
  onExportNotes?: () => void;
  onExportNotesJson?: () => void;
  onExportReadwise?: () => void;
  onSelectCollection?: (id: string | null) => void;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;
  onRenameCollection?: (id: string, name: string) => Promise<Collection | { error: string }>;
  onDeleteCollection?: (id: string) => Promise<boolean>;
}

const FeedSidebarContext = createContext<FeedSidebarActions | null>(null);

interface ProviderProps {
  value: FeedSidebarActions;
  children: ReactNode;
}

export function FeedSidebarProvider({ value, children }: ProviderProps) {
  return <FeedSidebarContext.Provider value={value}>{children}</FeedSidebarContext.Provider>;
}

export function useFeedSidebarContext(): FeedSidebarActions {
  const ctx = useContext(FeedSidebarContext);
  if (!ctx) {
    throw new Error("useFeedSidebarContext must be used within a FeedSidebarProvider");
  }
  return ctx;
}
