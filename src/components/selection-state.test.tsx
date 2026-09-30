import { useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Article, Feed, FeedView } from "../types";
import { SelectedArticleCtx } from "../contexts/SelectedArticleContext";
import { BulkSelectionCtx } from "../contexts/BulkSelectionContext";
import { CardArticleItem } from "./article-items/CardItem";
import { CompactArticleItem } from "./article-items/CompactItem";
import { GalleryArticleItem } from "./article-items/GalleryItem";
import { ListArticleItem } from "./article-items/ListItem";
import { MagazineFeaturedArticleItem } from "./article-items/MagazineItem";
import type { ArticleItemProps } from "./article-items/shared";
import FeedItem from "./feed-item";
import FeedSidebar from "./feed-sidebar";
import FeedViewTabs from "./feed-sidebar/FeedViewTabs";
import SpecialViewButton from "./feed-sidebar/SpecialViewButton";

// Keep navigation rendering real; unrelated data/actions and the footer have their own tests.
vi.mock("../contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("../contexts/ArticleFilterContext", () => ({
  useArticleFilter: () => ({ onSaveFilter: vi.fn() }),
}));
vi.mock("../contexts/FeedSidebarContext", () => ({
  useFeedSidebarContext: () => ({
    onSelectFeed: vi.fn(),
    onSelectGroup: vi.fn(),
    onSelectTag: vi.fn(),
    onSelectCollection: vi.fn(),
  }),
}));
vi.mock("../contexts/UnreadStatsContext", () => ({
  useUnreadStats: () => ({
    unreadByFeed: new Map(),
    lastPublishedByFeed: new Map(),
    totalUnread: 0,
    readTodayCount: 0,
  }),
}));
vi.mock("./feed-sidebar/SidebarFooter", () => ({ default: () => null }));

afterEach(cleanup);

const article: Article = {
  id: "article-1",
  feedHash: "feed-1",
  guid: "article-1",
  title: "選択状態のテスト記事",
  link: "https://example.com/article",
  summary: "記事の概要",
  publishedAt: "2026-09-29T10:00:00Z",
  createdAt: "2026-09-29T10:00:00Z",
};

const feed: Feed = {
  id: "feed-1",
  title: "テストフィード",
  url: "https://example.com/feed",
  siteUrl: "https://example.com",
  lastFetchedAt: null,
  fetchError: null,
};

const articleProps: ArticleItemProps = {
  article,
  index: 0,
  isRead: false,
  isBookmarked: false,
  hasNote: false,
  feedName: feed.title,
  thumb: undefined,
  showFeedName: true,
  query: "",
  onSelectArticle: vi.fn(),
  onToggleRead: vi.fn(),
  onToggleBookmark: vi.fn(),
};

describe.each([
  ["list", ListArticleItem],
  ["compact", CompactArticleItem],
  ["card", CardArticleItem],
  ["magazine", MagazineFeaturedArticleItem],
  ["gallery", GalleryArticleItem],
] as const)("%s article selection", (_, Item) => {
  it("keeps the current marker independent from unread state and clears it on navigation", () => {
    const view = (selectedId: string | null, isRead: boolean) => (
      <SelectedArticleCtx value={selectedId}>
        <Item {...articleProps} isRead={isRead} />
      </SelectedArticleCtx>
    );
    const { rerender } = render(view(article.id, false));
    const row = screen.getByRole("article");
    const title = screen.getByText(article.title);
    expect(row).toHaveClass("selection-current");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(title).toHaveClass("font-medium");
    expect(row.querySelector(".bg-accent-dot")).not.toBeNull();

    rerender(view(article.id, true));
    expect(row).toHaveClass("selection-current");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(title).toHaveClass("font-normal");
    expect(row.querySelector(".bg-accent-dot")).toBeNull();

    rerender(view("article-2", true));
    expect(row).not.toHaveClass("selection-current");
    expect(row).not.toHaveAttribute("aria-current");
    expect(row).toHaveAttribute("tabindex", "-1");
    expect(row).toHaveClass("hover:bg-surface-hover");

    rerender(view(null, false));
    expect(row).not.toHaveClass("selection-current");
    expect(title).toHaveClass("font-medium");
    expect(row.querySelector(".bg-accent-dot")).not.toBeNull();
  });

  it("preserves keyboard activation and the separate bulk/focus ring", () => {
    const onSelectArticle = vi.fn();
    render(
      <SelectedArticleCtx value={article.id}>
        <BulkSelectionCtx value={new Set([article.id])}>
          <Item {...articleProps} onSelectArticle={onSelectArticle} />
        </BulkSelectionCtx>
      </SelectedArticleCtx>,
    );
    const row = screen.getByRole("article");
    expect(row).toHaveClass("selection-current", "ring-2", "focus-visible:ring-2");
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onSelectArticle).toHaveBeenCalledTimes(2);
    expect(onSelectArticle.mock.calls.map(([selectedArticle]) => selectedArticle)).toEqual([
      article,
      article,
    ]);
  });
});

describe("sidebar selection", () => {
  it("gives feed rows the same current marker without changing counts or activation", () => {
    const props: ComponentProps<typeof FeedItem> = {
      feed,
      count: 3,
      isSelected: true,
      isPinned: false,
      animationIndex: 0,
      onSelect: vi.fn(),
      onMarkAllRead: vi.fn(),
      onDelete: vi.fn(),
      onTogglePin: vi.fn(),
      onRename: vi.fn(),
      onRetry: vi.fn(),
    };
    const { rerender } = render(<FeedItem {...props} />);
    const row = screen.getByRole("button", { name: feed.title });
    expect(row).toHaveClass("selection-current", "text-selection-accent");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("3")).toHaveClass("text-text-muted");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(props.onSelect).toHaveBeenCalledWith(feed.id);

    rerender(<FeedItem {...props} isSelected={false} />);
    expect(row).not.toHaveClass("selection-current");
    expect(row).not.toHaveAttribute("aria-current");
    expect(row).toHaveClass("hover:bg-surface-hover");
  });

  it("uses the same marker for special views", () => {
    const onSelectFeed = vi.fn();
    const { rerender } = render(
      <SpecialViewButton
        id="bookmarks"
        label="ブックマーク"
        count={3}
        selectedFeedId="bookmarks"
        onSelectFeed={onSelectFeed}
      />,
    );
    const button = screen.getByRole("button", { name: "ブックマーク 3" });
    expect(button).toHaveClass("selection-current", "text-selection-accent");
    expect(button).toHaveAttribute("aria-current", "page");
    fireEvent.click(button);
    expect(onSelectFeed).toHaveBeenCalledWith("bookmarks");
    rerender(
      <SpecialViewButton
        id="bookmarks"
        label="ブックマーク"
        count={3}
        selectedFeedId={null}
        onSelectFeed={onSelectFeed}
      />,
    );
    expect(button).not.toHaveClass("selection-current");
    expect(button).not.toHaveAttribute("aria-current");
  });

  const sidebarProps: ComponentProps<typeof FeedSidebar> = {
    feeds: [feed],
    articles: [],
    readIds: new Set(),
    bookmarkCount: 0,
    readingListCount: 0,
    likeCount: 0,
    historyCount: 0,
    selectedFeedId: null,
    user: {
      id: "user-1",
      sub: "user-1",
      email: "reader@example.com",
      name: "Reader",
      picture: null,
    },
    theme: "light",
    refreshing: false,
    isOnline: true,
    pinnedFeedIds: new Set(),
    nsfwMode: false,
    activeFeedView: "articles",
    feedGroups: [{ id: "group-1", name: "テストグループ", order: 0, createdAt: article.createdAt }],
    articleTagIds: { [article.id]: ["tag-1"] },
    collections: [
      {
        id: "collection-1",
        name: "テストコレクション",
        articleIds: [article.id],
        order: 0,
        createdAt: article.createdAt,
      },
    ],
  };

  it.each([
    { selectedFeedId: feed.id },
    { selectedGroupId: "group-1" },
    { selectedTag: "tag-1" },
    { selectedCollectionId: "collection-1" },
  ])("only marks All as current when no specific selection is active: %j", (selection) => {
    const { rerender } = render(<FeedSidebar {...sidebarProps} />);
    const all = screen.getByRole("button", { name: "すべて" });
    expect(all).toHaveAttribute("aria-current", "page");
    expect(all.parentElement).toHaveClass("selection-current");
    rerender(<FeedSidebar {...sidebarProps} {...selection} />);
    expect(all).not.toHaveAttribute("aria-current");
    expect(all.parentElement).not.toHaveClass("selection-current");
    expect(document.querySelectorAll(".selection-current")).toHaveLength(1);
  });
});

describe("feed view tabs", () => {
  function Tabs() {
    const [activeView, setActiveView] = useState<FeedView>("articles");
    return <FeedViewTabs activeView={activeView} onChangeView={setActiveView} />;
  }

  it("retains the current underline during drag-over and keyboard navigation", () => {
    render(<Tabs />);
    const active = screen.getByRole("tab", { name: "記事" });
    const next = screen.getByRole("tab", { name: "画像" });
    expect(active).toHaveClass("selection-tab-current");
    expect(next).not.toHaveClass("selection-tab-current");
    fireEvent.dragEnter(active, { dataTransfer: { types: ["application/x-rss-feed-id"] } });
    expect(active).toHaveClass("selection-tab-current", "ring-2");
    expect(active).toHaveAttribute("aria-selected", "true");
    fireEvent.dragLeave(active);
    fireEvent.dragEnter(next, { dataTransfer: { types: ["application/x-rss-feed-id"] } });
    expect(next).toHaveClass("ring-2");
    expect(next).not.toHaveClass("selection-tab-current");
    expect(active).toHaveClass("selection-tab-current");
    fireEvent.dragLeave(next);
    fireEvent.keyDown(active, { key: "ArrowRight" });
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute("aria-selected", "true");
    expect(next).toHaveAttribute("tabindex", "0");
    expect(next).toHaveClass("selection-tab-current");
    expect(active).not.toHaveClass("selection-tab-current");
    fireEvent.keyDown(next, { key: "End" });
    expect(screen.getByRole("tab", { name: "SNS" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "SNS" }), { key: "Home" });
    expect(active).toHaveFocus();
    expect(active).toHaveClass("selection-tab-current");
  });
});
