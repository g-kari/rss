import { type RefObject } from "react";
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

export interface ShortcutContext {
  list: Article[];
  idx: number;
  selectedArticle: Article | null;
  selectedFeedId: string | null;
  feeds: Feed[];
  pinnedFeedIds: Set<string>;
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  fontSize: FontSize;
  fontFamily: FontFamily;
  layout: Layout;
  unreadOnly: boolean;
  bookmarkOnly: boolean;
  readingListOnly: boolean;
  likeOnly: boolean;
  digestMode: boolean;
  navigateTo: (article: Article | undefined) => void;
  onSelectFeed: (id: string | null) => void;
  markBulkRead: (ids: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  toggleBookmark: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleReadingList: (id: string) => void;
  toggleLike: (id: string) => void;
  showToast: (msg: string) => void;
  onChangeFontSize: (size: FontSize) => void;
  onChangeFontFamily: (family: FontFamily) => void;
  onChangeLayout: (layout: Layout) => void;
  toggleUnreadOnly: () => void;
  toggleBookmarkOnly: () => void;
  toggleReadingListOnly: () => void;
  toggleLikeOnly: () => void;
  toggleDigestMode: () => void;
  toggleSortOrder: () => SortOrder;
  cycleDateRange: () => DateRange;
  cycleReadingTimeRange: () => ReadingTimeRange;
  searchRef: RefObject<HTMLInputElement | null>;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  onShowSnoozeMenu: (articleId: string) => void;
  onShowFeedSwitcher: () => void;
}

export interface ShortcutDef {
  keys: string[];
  displayKey: string;
  description: string;
  handler?: (ctx: ShortcutContext, e: KeyboardEvent) => void;
}

function filterToastMsg(current: boolean, label: string): string {
  return `${label}: ${current ? "OFF" : "ON"}`;
}

function clipboardWrite(text: string, successMsg: string, showToast: (msg: string) => void): void {
  navigator.clipboard
    .writeText(text)
    .then(() => showToast(successMsg))
    .catch(() => showToast("コピーに失敗しました"));
}

function buildFeedOrder(feeds: Feed[], pinnedFeedIds: Set<string>): (Feed | null)[] {
  return [
    null,
    ...feeds.filter((f) => pinnedFeedIds.has(f.id)),
    ...feeds.filter((f) => !pinnedFeedIds.has(f.id)),
  ];
}

export const SHORTCUT_DEFS: readonly ShortcutDef[] = [
  {
    keys: ["j", "ArrowDown"],
    displayKey: "j / ↓",
    description: "次の記事",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(ctx.list[ctx.idx + 1]);
    },
  },
  {
    keys: ["k", "ArrowUp"],
    displayKey: "k / ↑",
    description: "前の記事",
    handler: (ctx, e) => {
      e.preventDefault();
      if (ctx.idx > 0) ctx.navigateTo(ctx.list[ctx.idx - 1]);
    },
  },
  {
    keys: ["n"],
    displayKey: "n",
    description: "次の未読記事へ",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(
        ctx.list
          .slice(ctx.idx + 1)
          .find((a) => !isArticleRead(a, ctx.readIds, ctx.readBeforeTimestamp)),
      );
    },
  },
  {
    keys: ["p"],
    displayKey: "p",
    description: "前の未読記事へ",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(
        ctx.list
          .slice(0, ctx.idx < 0 ? undefined : ctx.idx)
          .reverse()
          .find((a) => !isArticleRead(a, ctx.readIds, ctx.readBeforeTimestamp)),
      );
    },
  },
  {
    keys: ["x"],
    displayKey: "x",
    description: "ランダム未読記事へ",
    handler: (ctx, e) => {
      e.preventDefault();
      const unread = ctx.list.filter(
        (a) => !isArticleRead(a, ctx.readIds, ctx.readBeforeTimestamp),
      );
      const pool = unread.length > 0 ? unread : ctx.list;
      if (pool.length === 0) return;
      const candidates =
        pool.length > 1 ? pool.filter((a) => a.id !== ctx.selectedArticle?.id) : pool;
      const random = candidates[Math.floor(Math.random() * candidates.length)];
      ctx.navigateTo(random);
      ctx.showToast(unread.length > 0 ? "ランダム未読記事" : "ランダム記事");
    },
  },
  {
    keys: ["g"],
    displayKey: "g",
    description: "先頭の記事へ",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(ctx.list[0]);
    },
  },
  {
    keys: ["G"],
    displayKey: "G",
    description: "末尾の記事へ",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(ctx.list[ctx.list.length - 1]);
    },
  },
  {
    keys: ["o"],
    displayKey: "o",
    description: "元記事を開く",
    handler: (ctx) => {
      if (ctx.selectedArticle?.link)
        window.open(ctx.selectedArticle.link, "_blank", "noopener,noreferrer");
    },
  },
  { keys: [], displayKey: "v", description: "全文を取得" },
  { keys: [], displayKey: "a", description: "AI 要約" },
  { keys: [], displayKey: "P", description: "読み上げ開始 / 停止" },
  { keys: [], displayKey: "Space / Shift+Space", description: "記事を下 / 上にスクロール" },
  {
    keys: ["b"],
    displayKey: "b",
    description: "ブックマーク切替",
    handler: (ctx) => {
      if (ctx.selectedArticle) ctx.toggleBookmark(ctx.selectedArticle.id);
    },
  },
  {
    keys: ["L"],
    displayKey: "L",
    description: "いいね切替",
    handler: (ctx) => {
      if (ctx.selectedArticle) {
        ctx.toggleLike(ctx.selectedArticle.id);
        ctx.showToast(ctx.likeIds.has(ctx.selectedArticle.id) ? "いいね解除" : "いいね");
      }
    },
  },
  {
    keys: ["R"],
    displayKey: "R",
    description: "フィードを更新",
    handler: (ctx) => {
      const isSpecial =
        ctx.selectedFeedId !== null &&
        Object.values<string>(SPECIAL_FEED_IDS).includes(ctx.selectedFeedId);
      if (ctx.selectedFeedId && !isSpecial) {
        ctx.retryFeed(ctx.selectedFeedId).catch(() => {});
        ctx.showToast("フィードを更新中...");
      } else {
        ctx.refreshFeeds().catch(() => {});
        ctx.showToast("全フィードを更新中...");
      }
    },
  },
  {
    keys: ["t"],
    displayKey: "t",
    description: "リーディングリスト切替",
    handler: (ctx) => {
      if (ctx.selectedArticle) {
        ctx.toggleReadingList(ctx.selectedArticle.id);
        ctx.showToast(
          ctx.readingListIds.has(ctx.selectedArticle.id)
            ? "リーディングリストから削除"
            : "リーディングリストに追加",
        );
      }
    },
  },
  {
    keys: ["r"],
    displayKey: "r",
    description: "既読 / 未読切替",
    handler: (ctx) => {
      if (ctx.selectedArticle) ctx.toggleRead(ctx.selectedArticle.id);
    },
  },
  {
    keys: ["z"],
    displayKey: "z",
    description: "スヌーズ（期間選択）",
    handler: (ctx, e) => {
      if (ctx.selectedArticle) {
        e.preventDefault();
        ctx.onShowSnoozeMenu(ctx.selectedArticle.id);
      }
    },
  },
  {
    keys: ["e"],
    displayKey: "e",
    description: "現在記事より上を全既読",
    handler: (ctx, e) => {
      e.preventDefault();
      if (ctx.idx < 0) return;
      const above = ctx.list.slice(0, ctx.idx + 1).map((a) => a.id);
      ctx.markBulkRead(above);
      ctx.showToast(`${above.length}件を既読にしました`);
    },
  },
  {
    keys: ["m"],
    displayKey: "m",
    description: "全既読にする",
    handler: (ctx) => {
      const unreadCount = ctx.list.filter(
        (a) => !isArticleRead(a, ctx.readIds, ctx.readBeforeTimestamp),
      ).length;
      if (unreadCount >= 50 && !window.confirm(`${unreadCount}件の記事を全既読にしますか？`)) {
        return;
      }
      ctx.markAllRead(ctx.selectedFeedId);
    },
  },
  {
    keys: ["u"],
    displayKey: "u",
    description: "未読フィルター切替",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.toggleUnreadOnly();
      ctx.showToast(filterToastMsg(ctx.unreadOnly, "未読フィルター"));
    },
  },
  {
    keys: ["B"],
    displayKey: "B",
    description: "ブックマークフィルター切替",
    handler: (ctx) => {
      ctx.toggleBookmarkOnly();
      ctx.showToast(filterToastMsg(ctx.bookmarkOnly, "ブックマークフィルター"));
    },
  },
  {
    keys: ["T"],
    displayKey: "T",
    description: "リーディングリストフィルター切替",
    handler: (ctx) => {
      ctx.toggleReadingListOnly();
      ctx.showToast(filterToastMsg(ctx.readingListOnly, "リーディングリストフィルター"));
    },
  },
  {
    keys: ["I"],
    displayKey: "I",
    description: "いいねフィルター切替",
    handler: (ctx) => {
      ctx.toggleLikeOnly();
      ctx.showToast(filterToastMsg(ctx.likeOnly, "いいねフィルター"));
    },
  },
  {
    keys: ["D"],
    displayKey: "D",
    description: "ダイジェストモード切替（全フィード: フィードごとに最新3件）",
    handler: (ctx) => {
      ctx.toggleDigestMode();
      ctx.showToast(filterToastMsg(ctx.digestMode, "ダイジェストモード"));
    },
  },
  {
    keys: ["d"],
    displayKey: "d",
    description: "日付フィルター切替",
    handler: (ctx, e) => {
      e.preventDefault();
      const next = ctx.cycleDateRange();
      ctx.showToast(`日付フィルター: ${DATE_RANGE_LABELS[next]}`);
    },
  },
  {
    keys: ["w"],
    displayKey: "w",
    description: "読了時間フィルター切替",
    handler: (ctx, e) => {
      e.preventDefault();
      const next = ctx.cycleReadingTimeRange();
      ctx.showToast(`読了時間: ${READING_TIME_RANGE_LABELS[next]}`);
    },
  },
  {
    keys: ["s"],
    displayKey: "s",
    description: "ソート順切替",
    handler: (ctx) => {
      const next = ctx.toggleSortOrder();
      ctx.showToast(`ソート: ${SORT_ORDER_LABELS[next]}`);
    },
  },
  {
    keys: ["c"],
    displayKey: "c",
    description: "リンクをコピー",
    handler: (ctx) => {
      if (ctx.selectedArticle?.link) {
        if (typeof navigator.share === "function") {
          navigator
            .share({ url: ctx.selectedArticle.link, title: ctx.selectedArticle.title })
            .catch(() => {});
        } else {
          clipboardWrite(ctx.selectedArticle.link, "リンクをコピーしました", ctx.showToast);
        }
      }
    },
  },
  {
    keys: ["C"],
    displayKey: "C",
    description: "Markdownリンクをコピー",
    handler: (ctx) => {
      if (ctx.selectedArticle?.link) {
        const mdTitle = (ctx.selectedArticle.title || ctx.selectedArticle.link).replace(
          /[\\[\]]/g,
          "\\$&",
        );
        clipboardWrite(
          `[${mdTitle}](${ctx.selectedArticle.link})`,
          "Markdownリンクをコピーしました",
          ctx.showToast,
        );
      }
    },
  },
  {
    keys: ["f"],
    displayKey: "f",
    description: "フォントサイズ切替",
    handler: (ctx) => {
      const next = cycleValue(FONT_SIZE_CYCLE, ctx.fontSize);
      ctx.onChangeFontSize(next);
      ctx.showToast(`文字サイズ: ${FONT_SIZE_LABELS[next]}`);
    },
  },
  {
    keys: ["F"],
    displayKey: "F",
    description: "フォントファミリー切替 (ゴシック / 明朝 / 等幅)",
    handler: (ctx) => {
      const next = cycleValue(FONT_FAMILY_CYCLE, ctx.fontFamily);
      ctx.onChangeFontFamily(next);
      ctx.showToast(`フォント: ${FONT_FAMILY_LABELS[next]}`);
    },
  },
  {
    keys: ["l"],
    displayKey: "l",
    description: "レイアウト切替",
    handler: (ctx) => {
      const next = cycleValue(LAYOUT_CYCLE, ctx.layout);
      ctx.onChangeLayout(next);
      ctx.showToast(`レイアウト: ${LAYOUT_LABELS[next]}`);
    },
  },
  {
    keys: ["/"],
    displayKey: "/",
    description: "記事を検索",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.searchRef.current?.focus();
    },
  },
  {
    keys: ["]", "["],
    displayKey: "] / [",
    description: "次 / 前のフィード",
    handler: (ctx, e) => {
      e.preventDefault();
      const ordered = buildFeedOrder(ctx.feeds, ctx.pinnedFeedIds);
      const cur = ordered.findIndex((f) =>
        f === null ? ctx.selectedFeedId === null : f.id === ctx.selectedFeedId,
      );
      const delta = e.key === "]" ? 1 : -1;
      const target = ordered[(cur + delta + ordered.length) % ordered.length];
      ctx.onSelectFeed(target?.id ?? null);
      ctx.showToast(target ? target.title || target.url : "全記事");
    },
  },
  {
    keys: ["q"],
    displayKey: "q",
    description: "フィードクイックスイッチャー",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.onShowFeedSwitcher();
    },
  },
  { keys: [], displayKey: "?", description: "このヘルプを表示" },
  { keys: [], displayKey: "\\", description: "フォーカスモード切替（記事のみ全画面）" },
];

const shortcutLookup: ReadonlyMap<string, ShortcutDef> = (() => {
  const map = new Map<string, ShortcutDef>();
  for (const def of SHORTCUT_DEFS) {
    if (!def.handler) continue;
    for (const key of def.keys) {
      map.set(key, def);
    }
  }
  return map;
})();

export function getShortcutDef(key: string): ShortcutDef | undefined {
  return shortcutLookup.get(key);
}

export const SHORTCUTS: readonly [string, string][] = SHORTCUT_DEFS.map(
  (def) => [def.displayKey, def.description] as [string, string],
);

export const SHORTCUT_MAP: Readonly<Record<string, string>> = Object.fromEntries(SHORTCUTS);
