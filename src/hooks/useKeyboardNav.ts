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
import {
  cycleValue,
  DATE_RANGE_LABELS,
  FONT_FAMILY_CYCLE,
  FONT_FAMILY_LABELS,
  FONT_SIZE_CYCLE,
  FONT_SIZE_LABELS,
  LAYOUT_CYCLE,
  LAYOUT_LABELS,
  READING_TIME_RANGE_LABELS,
  SORT_ORDER_LABELS,
} from "../lib/article-utils";
import { SPECIAL_FEED_IDS } from "../lib/storage";
import { isArticleRead } from "../lib/article-filter";

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
}

/**
 * キーボードナビゲーション。
 * options は毎 render で変化するため ref に格納し、イベントリスナー自体は
 * マウント時に 1 回だけ登録する（依存配列なし）。
 *
 * ショートカット: j/↓ 次, k/↑ 前, n/p 次/前の未読, g 先頭, G 末尾,
 *               o 元記事, v 全文取得, b ブックマーク,
 *               t リーディングリスト切替, r 既読切替, m 全既読, c リンクコピー, C Markdownリンクコピー,
 *               z スヌーズ（期間選択）, f フォントサイズ, F フォントファミリー, l レイアウト, L いいね切替, R フィード更新,
 *               u 未読フィルター, B ブックマークフィルター, T リーディングリストフィルター, I いいねフィルター,
 *               s ソート, d 日付フィルター, w 読了時間フィルター,
 *               / 検索, ] 次フィード, [ 前フィード
 *               (v は ArticleView で処理)
 */
export function useKeyboardNav(options: KeyboardNavOptions): void {
  const ref = useSyncedRef(options);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const {
      filteredArticles,
      feeds,
      pinnedFeedIds,
      selectedFeedId,
      selectedArticle,
      readIds,
      readBeforeTimestamp,
      readingListIds,
      likeIds,
      setSelectedArticle,
      onSelectFeed,
      markRead,
      markBulkRead,
      markAllRead,
      toggleBookmark,
      toggleRead,
      toggleReadingList,
      toggleLike,
      showToast,
      fontSize,
      onChangeFontSize,
      fontFamily,
      onChangeFontFamily,
      layout,
      onChangeLayout,
      unreadOnly,
      toggleUnreadOnly,
      bookmarkOnly,
      toggleBookmarkOnly,
      readingListOnly,
      toggleReadingListOnly,
      likeOnly,
      toggleLikeOnly,
      digestMode,
      toggleDigestMode,
      toggleSortOrder,
      cycleDateRange,
      cycleReadingTimeRange,
      searchRef,
      refreshFeeds,
      retryFeed,
      onShowSnoozeMenu,
      onShowFeedSwitcher,
    } = ref.current;

    const list = filteredArticles;
    const idx = selectedArticle ? list.findIndex((a) => a.id === selectedArticle.id) : -1;

    /** 記事に移動して既読にマーク */
    const navigateTo = (article: Article | undefined) => {
      if (article) {
        setSelectedArticle(article);
        markRead(article.id);
      }
    };

    // フィルタートグルのlookup table（u/B/T/I/D キー）
    const filterToggleMap: Record<
      string,
      { toggle: () => void; state: boolean; label: string; prevent?: true }
    > = {
      u: { toggle: toggleUnreadOnly, state: unreadOnly, label: "未読フィルター", prevent: true },
      B: { toggle: toggleBookmarkOnly, state: bookmarkOnly, label: "ブックマークフィルター" },
      T: {
        toggle: toggleReadingListOnly,
        state: readingListOnly,
        label: "リーディングリストフィルター",
      },
      I: { toggle: toggleLikeOnly, state: likeOnly, label: "いいねフィルター" },
      D: { toggle: toggleDigestMode, state: digestMode, label: "ダイジェストモード" },
    };
    const filterToggle = filterToggleMap[e.key];
    if (filterToggle) {
      if (filterToggle.prevent) e.preventDefault();
      filterToggle.toggle();
      showToast(filterToastMsg(filterToggle.state, filterToggle.label));
      return;
    }

    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        navigateTo(list[idx + 1]);
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        if (idx > 0) navigateTo(list[idx - 1]);
        break;
      case "n":
        e.preventDefault();
        navigateTo(
          list.slice(idx + 1).find((a) => !isArticleRead(a, readIds, readBeforeTimestamp)),
        );
        break;
      case "p":
        e.preventDefault();
        navigateTo(
          list
            .slice(0, idx < 0 ? undefined : idx)
            .reverse()
            .find((a) => !isArticleRead(a, readIds, readBeforeTimestamp)),
        );
        break;
      case "g":
        e.preventDefault();
        navigateTo(list[0]);
        break;
      case "G":
        e.preventDefault();
        navigateTo(list[list.length - 1]);
        break;
      case "o":
        if (selectedArticle?.link)
          window.open(selectedArticle.link, "_blank", "noopener,noreferrer");
        break;
      case "b":
        if (selectedArticle) toggleBookmark(selectedArticle.id);
        break;
      case "t":
        if (selectedArticle) {
          toggleReadingList(selectedArticle.id);
          showToast(
            readingListIds.has(selectedArticle.id)
              ? "リーディングリストから削除"
              : "リーディングリストに追加",
          );
        }
        break;
      case "r":
        if (selectedArticle) toggleRead(selectedArticle.id);
        break;
      case "z":
        if (selectedArticle) {
          e.preventDefault();
          onShowSnoozeMenu(selectedArticle.id);
        }
        break;
      case "e": {
        // 現在選択中の記事（含む）より上にある記事を全既読にする
        e.preventDefault();
        if (idx < 0) break;
        const above = list.slice(0, idx + 1).map((a) => a.id);
        markBulkRead(above);
        showToast(`${above.length}件を既読にしました`);
        break;
      }
      case "m":
        markAllRead(selectedFeedId);
        break;
      case "c":
        if (selectedArticle?.link) {
          if (typeof navigator.share === "function") {
            navigator
              .share({ url: selectedArticle.link, title: selectedArticle.title })
              .catch(() => {});
          } else {
            clipboardWrite(selectedArticle.link, "リンクをコピーしました", showToast);
          }
        }
        break;
      case "C":
        if (selectedArticle?.link) {
          // Markdown リンクのラベル内で `\` と `[`/`]` は Markdown エスケープを成立させるため、
          // `\` を先にエスケープしてから角括弧をエスケープする必要がある。
          const mdTitle = (selectedArticle.title || selectedArticle.link).replace(
            /[\\[\]]/g,
            "\\$&",
          );
          clipboardWrite(
            `[${mdTitle}](${selectedArticle.link})`,
            "Markdownリンクをコピーしました",
            showToast,
          );
        }
        break;
      case "f": {
        const next = cycleValue(FONT_SIZE_CYCLE, fontSize);
        onChangeFontSize(next);
        showToast(`文字サイズ: ${FONT_SIZE_LABELS[next]}`);
        break;
      }
      case "F": {
        const next = cycleValue(FONT_FAMILY_CYCLE, fontFamily);
        onChangeFontFamily(next);
        showToast(`フォント: ${FONT_FAMILY_LABELS[next]}`);
        break;
      }
      case "l": {
        const next = cycleValue(LAYOUT_CYCLE, layout);
        onChangeLayout(next);
        showToast(`レイアウト: ${LAYOUT_LABELS[next]}`);
        break;
      }
      case "L":
        if (selectedArticle) {
          toggleLike(selectedArticle.id);
          showToast(likeIds.has(selectedArticle.id) ? "いいね解除" : "いいね");
        }
        break;
      case "R": {
        const isSpecial =
          selectedFeedId !== null &&
          Object.values<string>(SPECIAL_FEED_IDS).includes(selectedFeedId);
        if (selectedFeedId && !isSpecial) {
          retryFeed(selectedFeedId).catch(() => {});
          showToast("フィードを更新中...");
        } else {
          refreshFeeds().catch(() => {});
          showToast("全フィードを更新中...");
        }
        break;
      }
      case "s": {
        const nextSort = toggleSortOrder();
        showToast(`ソート: ${SORT_ORDER_LABELS[nextSort]}`);
        break;
      }
      case "d": {
        e.preventDefault();
        const next = cycleDateRange();
        showToast(`日付フィルター: ${DATE_RANGE_LABELS[next]}`);
        break;
      }
      case "w": {
        e.preventDefault();
        const next = cycleReadingTimeRange();
        showToast(`読了時間: ${READING_TIME_RANGE_LABELS[next]}`);
        break;
      }
      case "x": {
        e.preventDefault();
        const unread = list.filter((a) => !isArticleRead(a, readIds, readBeforeTimestamp));
        const pool = unread.length > 0 ? unread : list;
        if (pool.length === 0) break;
        // 現在選択中の記事を除いて選ぶ（1件のみなら除外しない）
        const candidates =
          pool.length > 1 ? pool.filter((a) => a.id !== selectedArticle?.id) : pool;
        const random = candidates[Math.floor(Math.random() * candidates.length)];
        navigateTo(random);
        showToast(unread.length > 0 ? "ランダム未読記事" : "ランダム記事");
        break;
      }
      case "q":
        e.preventDefault();
        onShowFeedSwitcher();
        break;
      case "/":
        e.preventDefault();
        searchRef.current?.focus();
        break;
      case "]":
      case "[": {
        e.preventDefault();
        const ordered = buildFeedOrder(feeds, pinnedFeedIds);
        const cur = ordered.findIndex((f) =>
          f === null ? selectedFeedId === null : f.id === selectedFeedId,
        );
        const delta = e.key === "]" ? 1 : -1;
        const target = ordered[(cur + delta + ordered.length) % ordered.length];
        onSelectFeed(target?.id ?? null);
        showToast(target ? target.title || target.url : "全記事");
        break;
      }
    }
  }

  useEventListener("keydown", handleKeyDown, document);
}

/** ピン留め優先のフィード順序配列（先頭は null = 全記事）を生成 */
function buildFeedOrder(feeds: Feed[], pinnedFeedIds: Set<string>): (Feed | null)[] {
  return [
    null,
    ...feeds.filter((f) => pinnedFeedIds.has(f.id)),
    ...feeds.filter((f) => !pinnedFeedIds.has(f.id)),
  ];
}

/** クリップボードにテキストを書き込み、結果をトーストで表示する */
function clipboardWrite(text: string, successMsg: string, showToast: (msg: string) => void): void {
  navigator.clipboard
    .writeText(text)
    .then(() => showToast(successMsg))
    .catch(() => showToast("コピーに失敗しました"));
}

/**
 * フィルタートグル後のトーストメッセージを生成する。
 * current は現在の（トグル前の）状態。
 * ON/OFF は次の（トグル後の）状態を示す。
 */
function filterToastMsg(current: boolean, label: string): string {
  return `${label}: ${current ? "OFF" : "ON"}`;
}
