"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { Article, Feed, FontSize, Layout, DateRange } from "../types";
import type { SortOrder } from "./useFilteredArticles";
import { cycleValue, DATE_RANGE_LABELS } from "../lib/article-utils";
import { SPECIAL_FEED_IDS } from "../lib/storage";

interface KeyboardNavOptions {
  filteredArticles: Article[];
  feeds: Feed[];
  pinnedFeedIds: Set<string>;
  selectedFeedId: string | null;
  selectedArticle: Article | null;
  readIds: Set<string>;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  setSelectedArticle: (article: Article) => void;
  onSelectFeed: (id: string | null) => void;
  markRead: (id: string) => void;
  markAllRead: (feedId: string | null) => void;
  toggleBookmark: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleReadingList: (id: string) => void;
  toggleLike: (id: string) => void;
  showToast: (msg: string) => void;
  fontSize: FontSize;
  onChangeFontSize: (size: FontSize) => void;
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
  unreadOnly: boolean;
  toggleUnreadOnly: () => void;
  bookmarkOnly: boolean;
  toggleBookmarkOnly: () => void;
  readingListOnly: boolean;
  toggleReadingListOnly: () => void;
  sortOrder: SortOrder;
  toggleSortOrder: () => void;
  dateRange: DateRange;
  cycleDateRange: () => DateRange;
  searchRef: RefObject<HTMLInputElement | null>;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
}

const FONT_SIZE_CYCLE: FontSize[] = ["small", "medium", "large"];
const FONT_SIZE_LABELS: Record<FontSize, string> = { small: "小", medium: "中", large: "大" };
const LAYOUT_CYCLE: Layout[] = ["compact", "list", "card", "magazine"];
const LAYOUT_LABELS: Record<Layout, string> = {
  compact: "コンパクト",
  list: "リスト",
  card: "カード",
  magazine: "マガジン",
};

/**
 * キーボードナビゲーション。
 * options は毎 render で変化するため ref に格納し、イベントリスナー自体は
 * マウント時に 1 回だけ登録する（依存配列なし）。
 *
 * ショートカット: j/↓ 次, k/↑ 前, n/p 次/前の未読, o 元記事, v 全文取得, b ブックマーク,
 *               t リーディングリスト切替, r 既読切替, m 全既読, c リンクコピー, C Markdownリンクコピー,
 *               f フォントサイズ, l レイアウト, L いいね切替, R フィード更新,
 *               u 未読フィルター, B ブックマークフィルター, T リーディングリストフィルター,
 *               s ソート, d 日付フィルター,
 *               / 検索, ] 次フィード, [ 前フィード
 *               (v は ArticleView で処理)
 */
export function useKeyboardNav(options: KeyboardNavOptions): void {
  const ref = useRef(options);
  ref.current = options;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const {
        filteredArticles,
        feeds,
        pinnedFeedIds,
        selectedFeedId,
        selectedArticle,
        readIds,
        readingListIds,
        likeIds,
        setSelectedArticle,
        onSelectFeed,
        markRead,
        markAllRead,
        toggleBookmark,
        toggleRead,
        toggleReadingList,
        toggleLike,
        showToast,
        fontSize,
        onChangeFontSize,
        layout,
        onChangeLayout,
        unreadOnly,
        toggleUnreadOnly,
        bookmarkOnly,
        toggleBookmarkOnly,
        readingListOnly,
        toggleReadingListOnly,
        sortOrder,
        toggleSortOrder,
        cycleDateRange,
        searchRef,
        refreshFeeds,
        retryFeed,
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
          navigateTo(list.slice(idx + 1).find((a) => !readIds.has(a.id)));
          break;
        case "p":
          e.preventDefault();
          navigateTo(
            list
              .slice(0, idx < 0 ? undefined : idx)
              .reverse()
              .find((a) => !readIds.has(a.id)),
          );
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
              navigator.clipboard
                .writeText(selectedArticle.link)
                .then(() => showToast("リンクをコピーしました"))
                .catch(() => showToast("コピーに失敗しました"));
            }
          }
          break;
        case "C":
          if (selectedArticle?.link) {
            const mdTitle = (selectedArticle.title || selectedArticle.link).replace(
              /[[\]]/g,
              "\\$&",
            );
            const mdLink = `[${mdTitle}](${selectedArticle.link})`;
            navigator.clipboard
              .writeText(mdLink)
              .then(() => showToast("Markdownリンクをコピーしました"))
              .catch(() => showToast("コピーに失敗しました"));
          }
          break;
        case "f": {
          const next = cycleValue(FONT_SIZE_CYCLE, fontSize);
          onChangeFontSize(next);
          showToast(`文字サイズ: ${FONT_SIZE_LABELS[next]}`);
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
          const isSpecial = Object.values(SPECIAL_FEED_IDS).includes(
            selectedFeedId as (typeof SPECIAL_FEED_IDS)[keyof typeof SPECIAL_FEED_IDS],
          );
          if (selectedFeedId && !isSpecial) {
            retryFeed(selectedFeedId).catch(() => {});
            showToast("フィードを更新中...");
          } else {
            refreshFeeds().catch(() => {});
            showToast("全フィードを更新中...");
          }
          break;
        }
        case "u":
          e.preventDefault();
          toggleUnreadOnly();
          showToast(!unreadOnly ? "未読フィルター: ON" : "未読フィルター: OFF");
          break;
        case "B":
          toggleBookmarkOnly();
          showToast(!bookmarkOnly ? "ブックマークフィルター: ON" : "ブックマークフィルター: OFF");
          break;
        case "T":
          toggleReadingListOnly();
          showToast(
            !readingListOnly
              ? "リーディングリストフィルター: ON"
              : "リーディングリストフィルター: OFF",
          );
          break;
        case "s":
          toggleSortOrder();
          showToast(sortOrder === "newest" ? "ソート: 古い順" : "ソート: 新しい順");
          break;
        case "d": {
          e.preventDefault();
          const next = cycleDateRange();
          showToast(`日付フィルター: ${DATE_RANGE_LABELS[next]}`);
          break;
        }
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

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 意図的: ref 経由で最新値を参照
}

/** ピン留め優先のフィード順序配列（先頭は null = 全記事）を生成 */
function buildFeedOrder(feeds: Feed[], pinnedFeedIds: Set<string>): (Feed | null)[] {
  return [
    null,
    ...feeds.filter((f) => pinnedFeedIds.has(f.id)),
    ...feeds.filter((f) => !pinnedFeedIds.has(f.id)),
  ];
}
