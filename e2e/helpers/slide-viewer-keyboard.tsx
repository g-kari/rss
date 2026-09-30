import { useRef, useState } from "react";
import SlideViewer from "../../src/components/article-view/SlideViewer";
import { useKeyboardNav } from "../../src/hooks/useKeyboardNav";
import { useAppModalState } from "../../src/hooks/useAppModalState";
import { makeArticle } from "./article";

export const SLIDE_KEYBOARD_URL = "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3";

/** Use the real viewer and document shortcut hooks without an account or remote data. */
export default function SlideViewerKeyboardHarness() {
  const articles = ["Previous", "Current", "Next"].map((title) =>
    makeArticle({ id: title, title }),
  );
  const [selected, setSelected] = useState(articles[1]!);
  const [readIds, setReadIds] = useState(new Set<string>());
  const [actions, setActions] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const { showHelp, showSettings } = useAppModalState();
  const action = () => setActions((count) => count + 1);
  useKeyboardNav({
    filteredArticles: articles,
    feeds: [],
    pinnedFeedIds: new Set(),
    selectedFeedId: null,
    selectedArticle: selected,
    readIds,
    readBeforeTimestamp: null,
    readingListIds: new Set(),
    likeIds: new Set(),
    setSelectedArticle: setSelected,
    onSelectFeed: action,
    markRead: (id) => setReadIds((ids) => new Set([...ids, id])),
    markBulkRead: action,
    markAllRead: action,
    toggleBookmark: action,
    toggleRead: action,
    toggleReadingList: action,
    toggleLike: action,
    showToast: () => {},
    fontSize: "medium",
    onChangeFontSize: action,
    fontFamily: "sans",
    onChangeFontFamily: action,
    layout: "list",
    onChangeLayout: action,
    unreadOnly: false,
    toggleUnreadOnly: action,
    bookmarkOnly: false,
    toggleBookmarkOnly: action,
    readingListOnly: false,
    toggleReadingListOnly: action,
    likeOnly: false,
    toggleLikeOnly: action,
    noteOnly: false,
    toggleNoteOnly: action,
    resetAllFilters: action,
    digestMode: false,
    toggleDigestMode: action,
    toggleSortOrder: () => "newest",
    cycleDateRange: () => "all",
    cycleReadingTimeRange: () => "all",
    readingTimeRange: "all",
    searchRef,
    refreshFeeds: async () => {},
    retryFeed: async () => {},
    snoozeArticle: action,
    onShowSnoozeMenu: action,
    onShowFeedSwitcher: action,
    onShowReadingStats: action,
    confirm: async () => true,
    autoMode: false,
    toggleAutoMode: action,
    ttsSupported: false,
    cycleTtsRate: () => 1,
  });
  return (
    <>
      <p data-testid="selected">{selected.id}</p>
      <p data-testid="read">{[...readIds].join(",")}</p>
      <p data-testid="actions">{actions}</p>
      <p data-testid="help">{String(showHelp)}</p>
      <p data-testid="settings">{String(showSettings)}</p>
      <input ref={searchRef} aria-label="Search" />
      <SlideViewer url={SLIDE_KEYBOARD_URL} title="Deck" />
    </>
  );
}
