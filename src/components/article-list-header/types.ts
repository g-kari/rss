import type { ReactNode } from "react";
import type { Feed, Layout } from "../../types";

export interface ArticleListHeaderProps {
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
  listFocusMode: boolean;
  onToggleListFocusMode: () => void;
  onMobileBack?: () => void;
  onMarkAllRead?: () => void;
  filteredCount: number;
  selectedFeedId: string | null;
  feeds: Feed[];
}

export interface FilterPillButtonProps {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  variant?: "default" | "bookmark" | "like" | "note";
}
