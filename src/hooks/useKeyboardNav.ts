"use client";

import { type RefObject } from "react";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
import type {
  Article,
  Feed,
  FontFamily,
  FontSize,
  Layout,
  DateRange,
  SortOrder,
  ReadingTimeRange,
} from "../types";
import { getShortcutDef, type ShortcutContext } from "../config/shortcuts";

interface KeyboardNavOptions {
  filteredArticles: Article[];
  feeds: Feed[];
  pinnedFeedIds: Set<string>;
  selectedFeedId: string | null;
  selectedArticle: Article | null;
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  setSelectedArticle: (article: Article) => void;
  onSelectFeed: (id: string | null) => void;
  markRead: (id: string) => void;
  markBulkRead: (ids: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  toggleBookmark: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleReadingList: (id: string) => void;
  toggleLike: (id: string) => void;
  showToast: (msg: string) => void;
  fontSize: FontSize;
  onChangeFontSize: (size: FontSize) => void;
  fontFamily: FontFamily;
  onChangeFontFamily: (family: FontFamily) => void;
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
  unreadOnly: boolean;
  toggleUnreadOnly: () => void;
  bookmarkOnly: boolean;
  toggleBookmarkOnly: () => void;
  readingListOnly: boolean;
  toggleReadingListOnly: () => void;
  likeOnly: boolean;
  toggleLikeOnly: () => void;
  noteOnly: boolean;
  toggleNoteOnly: () => void;
  digestMode: boolean;
  toggleDigestMode: () => void;
  toggleSortOrder: () => SortOrder;
  cycleDateRange: () => DateRange;
  cycleReadingTimeRange: () => ReadingTimeRange;
  readingTimeRange: ReadingTimeRange;
  searchRef: RefObject<HTMLInputElement | null>;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  snoozeArticle: (articleId: string, durationMs: number) => void;
  onShowSnoozeMenu: (articleId: string) => void;
  onShowFeedSwitcher: () => void;
  onArticleAnnounce?: (title: string) => void;
  /** 確認ダイアログ (`useConfirm` + `ConfirmModal` canonical)。`window.confirm` 禁止のため必須。 */
  confirm: (message: string) => Promise<boolean>;
  autoMode: boolean;
  toggleAutoMode: () => void;
  ttsSupported: boolean;
  /** UX 監査 (#2): 読み上げ速度を次値にサイクル (Shift+R) */
  cycleTtsRate: () => number;
  /** #684: 記事一覧を選択中記事へアンカー (`.` キー) */
  anchorListToSelected?: () => void;
}

function buildContext(opts: KeyboardNavOptions): ShortcutContext {
  const list = opts.filteredArticles;
  // narrowed な定数を closure 外で抽出 (closure 内では TS control flow 解析が失われて
  // ! が必要になるが、外で `const sel = opts.selectedArticle` と束縛すれば narrowed 維持)。
  const sel = opts.selectedArticle;
  const idx = sel ? list.findIndex((a) => a.id === sel.id) : -1;
  return {
    ...opts,
    list,
    idx,
    navigateTo: (article) => {
      if (article) {
        opts.setSelectedArticle(article);
        opts.markRead(article.id);
        opts.onArticleAnnounce?.(article.title);
      }
    },
    confirm: opts.confirm,
  };
}

/**
 * グローバルキーボードナビゲーション (j/k で記事移動 / m で既読 / b でブックマーク / 等) を window に attach する hook。
 * @param options - 各 action の callback と選択中記事 / 一覧を含む `KeyboardNavOptions`
 */
export function useKeyboardNav(options: KeyboardNavOptions): void {
  const ref = useSyncedRef(options);

  function handleKeyDown(e: KeyboardEvent) {
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    )
      return;

    const comboKey = e.ctrlKey ? `Control+${e.key}` : e.metaKey ? `Meta+${e.key}` : e.key;
    const def = getShortcutDef(comboKey);
    if (!def?.handler) return;

    def.handler(buildContext(ref.current), e);
  }

  useEventListener("keydown", handleKeyDown, document);
}
