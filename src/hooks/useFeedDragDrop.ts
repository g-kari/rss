import { useState, useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { Feed, FeedView } from "../types";
import { resolveFeedViewDrop, resolveFeedGroupDrop } from "../lib/feed-group-drop";

interface UseFeedDragDropParams {
  feeds: Feed[];
  onSetFeedView?: (feed: Feed, view: FeedView | null) => Promise<void>;
  onSetGroupFeed?: (feed: Feed, groupId: string | null) => Promise<void>;
}

interface UseFeedDragDropReturn {
  draggedFeedId: string | null;
  setDraggedFeedId: Dispatch<SetStateAction<string | null>>;
  dragOverGroupId: string | null;
  setDragOverGroupId: Dispatch<SetStateAction<string | null>>;
  dragOverUngrouped: boolean;
  setDragOverUngrouped: Dispatch<SetStateAction<boolean>>;
  handleDropFeedOnView: (feedId: string, view: FeedView) => void;
  handleDropFeedOnGroup: (feedId: string, groupId: string | null) => void;
  draggedFeedInGroup: boolean;
}

export function useFeedDragDrop({
  feeds,
  onSetFeedView,
  onSetGroupFeed,
}: UseFeedDragDropParams): UseFeedDragDropReturn {
  const [draggedFeedId, setDraggedFeedId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);

  const handleDropFeedOnView = useCallback(
    (feedId: string, view: FeedView) => {
      if (!onSetFeedView) return;
      const resolved = resolveFeedViewDrop(feedId, view, feeds);
      if (!resolved) return;
      void onSetFeedView(resolved.feed, resolved.targetView);
    },
    [feeds, onSetFeedView],
  );

  const handleDropFeedOnGroup = useCallback(
    (feedId: string, groupId: string | null) => {
      if (!onSetGroupFeed) return;
      const resolved = resolveFeedGroupDrop(feedId, groupId, feeds);
      if (!resolved) return;
      void onSetGroupFeed(resolved.feed, resolved.targetGroupId);
    },
    [feeds, onSetGroupFeed],
  );

  const draggedFeedInGroup = useMemo(() => {
    if (!draggedFeedId) return false;
    const feed = feeds.find((f) => f.id === draggedFeedId);
    return !!feed?.groupId;
  }, [draggedFeedId, feeds]);

  return {
    draggedFeedId,
    setDraggedFeedId,
    dragOverGroupId,
    setDragOverGroupId,
    dragOverUngrouped,
    setDragOverUngrouped,
    handleDropFeedOnView,
    handleDropFeedOnGroup,
    draggedFeedInGroup,
  };
}
