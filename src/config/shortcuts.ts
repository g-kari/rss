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
  noteOnly: boolean;
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
  toggleNoteOnly: () => void;
  toggleDigestMode: () => void;
  toggleSortOrder: () => SortOrder;
  cycleDateRange: () => DateRange;
  cycleReadingTimeRange: () => ReadingTimeRange;
  searchRef: RefObject<HTMLInputElement | null>;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  onShowSnoozeMenu: (articleId: string) => void;
  onShowFeedSwitcher: () => void;
  toggleAutoMode: () => void;
  autoMode: boolean;
  ttsSupported: boolean;
  /** UX 監査 (#2): 読み上げ速度を次値にサイクル (Shift+R) */
  cycleTtsRate: () => number;
  /** #684: 記事一覧を選択中記事にスクロール (アンカー) */
  anchorListToSelected?: () => void;
  /** window.confirm の代替。未指定時は window.confirm にフォールバック。 */
  confirm?: (message: string) => Promise<boolean>;
}

/** ショートカットのグループ分類 */
export type ShortcutGroup = "navigation" | "article" | "filter" | "display" | "global";

export interface ShortcutDef {
  keys: string[];
  displayKey: string;
  description: string;
  /** ショートカットのカテゴリ。KeyboardShortcutsModal でのグルーピングに使用 */
  group: ShortcutGroup;
  handler?: (ctx: ShortcutContext, e: KeyboardEvent) => void;
}

/**
 * キーボードショートカットの Single Source of Truth。
 * `useKeyboardNav`（実装）と `KeyboardShortcutsModal`（UI表示）の両方がここを参照する。
 * Issue #360: 実装と仕様の乖離を防ぐための定数。
 */
export interface KeyboardShortcut {
  key: string;
  description: string;
  group: ShortcutGroup;
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
    keys: ["j", "ArrowDown", "PageDown"],
    displayKey: "j / ↓ / PgDn",
    description: "次の記事",
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(ctx.list[ctx.idx + 1]);
    },
  },
  {
    keys: ["k", "ArrowUp", "PageUp"],
    displayKey: "k / ↑ / PgUp",
    description: "前の記事",
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      if (ctx.idx > 0) ctx.navigateTo(ctx.list[ctx.idx - 1]);
    },
  },
  {
    keys: ["n"],
    displayKey: "n",
    description: "次の未読記事へ",
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      const readBeforeMs = ctx.readBeforeTimestamp ? Date.parse(ctx.readBeforeTimestamp) : null;
      ctx.navigateTo(
        ctx.list.slice(ctx.idx + 1).find((a) => !isArticleRead(a, ctx.readIds, readBeforeMs)),
      );
    },
  },
  {
    keys: ["p"],
    displayKey: "p",
    description: "前の未読記事へ",
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      const readBeforeMs = ctx.readBeforeTimestamp ? Date.parse(ctx.readBeforeTimestamp) : null;
      ctx.navigateTo(
        ctx.list
          .slice(0, ctx.idx < 0 ? undefined : ctx.idx)
          .reverse()
          .find((a) => !isArticleRead(a, ctx.readIds, readBeforeMs)),
      );
    },
  },
  {
    keys: ["x"],
    displayKey: "x",
    description: "ランダム未読記事へ",
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      const readBeforeMs = ctx.readBeforeTimestamp ? Date.parse(ctx.readBeforeTimestamp) : null;
      const unread = ctx.list.filter((a) => !isArticleRead(a, ctx.readIds, readBeforeMs));
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
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(ctx.list[0]);
    },
  },
  {
    keys: ["G"],
    displayKey: "G",
    description: "末尾の記事へ",
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.navigateTo(ctx.list[ctx.list.length - 1]);
    },
  },
  {
    keys: ["."],
    displayKey: ".",
    description: "記事一覧を選択中の記事にアンカー (#684)",
    group: "navigation",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.anchorListToSelected?.();
    },
  },
  {
    keys: ["o"],
    displayKey: "o",
    description: "元記事を開く",
    group: "navigation",
    handler: (ctx) => {
      if (ctx.selectedArticle?.link)
        window.open(ctx.selectedArticle.link, "_blank", "noopener,noreferrer");
    },
  },
  { keys: [], displayKey: "v", description: "全文を取得", group: "article" },
  { keys: [], displayKey: "a", description: "AI 要約", group: "article" },
  { keys: [], displayKey: "P", description: "読み上げ開始 / 停止", group: "article" },
  {
    keys: ["A"],
    displayKey: "Shift+A",
    description: "オートモード切替（自動全文取得 → 読み上げ → 次へ）",
    group: "article",
    handler: (ctx) => {
      if (!ctx.ttsSupported) {
        ctx.showToast("お使いのブラウザは音声合成に非対応です");
        return;
      }
      ctx.toggleAutoMode();
      ctx.showToast(filterToastMsg(ctx.autoMode, "オートモード"));
    },
  },
  {
    keys: ["R"],
    displayKey: "Shift+R",
    description: "読み上げ速度を切替（0.5x → 0.75x → 1x → … → 4x → 0.5x）",
    group: "article",
    handler: (ctx) => {
      if (!ctx.ttsSupported) {
        ctx.showToast("お使いのブラウザは音声合成に非対応です");
        return;
      }
      const next = ctx.cycleTtsRate();
      ctx.showToast(`読み上げ速度: ${next}x`);
    },
  },
  {
    keys: [" "],
    displayKey: "Space / Shift+Space",
    description: "記事を下 / 上にスクロール",
    group: "article",
    handler: (ctx, e) => {
      // 記事が選択されているときのみ反応
      if (!ctx.selectedArticle) return;
      const main = document.querySelector<HTMLElement>('main[aria-label="記事本文"]');
      if (!main) return;
      // ブラウザのデフォルト Space スクロールを抑止して、自前で記事ビュー領域内をスクロール
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      main.scrollBy({ top: direction * main.clientHeight * 0.9, behavior: "smooth" });
    },
  },
  {
    keys: ["b"],
    displayKey: "b",
    description: "ブックマーク切替",
    group: "article",
    handler: (ctx) => {
      if (ctx.selectedArticle) ctx.toggleBookmark(ctx.selectedArticle.id);
    },
  },
  {
    keys: ["L"],
    displayKey: "L",
    description: "いいね切替",
    group: "article",
    handler: (ctx) => {
      if (ctx.selectedArticle) {
        ctx.toggleLike(ctx.selectedArticle.id);
        ctx.showToast(ctx.likeIds.has(ctx.selectedArticle.id) ? "いいね解除" : "いいね");
      }
    },
  },
  {
    // #776: 衝突回避 — Shift+R (TTS rate cycle) は keys:["R"] (大文字、shifted)、
    // フィード更新は keys:["r"] (小文字、unshifted) に分離。
    // displayKey は視認性のため "R" (大文字) のまま維持。
    keys: ["r"],
    displayKey: "R",
    description: "フィードを更新",
    group: "global",
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
    group: "article",
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
    group: "article",
    handler: (ctx) => {
      if (ctx.selectedArticle) ctx.toggleRead(ctx.selectedArticle.id);
    },
  },
  // スヌーズショートカット (z) は #619 で UI からオミット。
  // バックエンド (snoozeArticle / snoozedUntil) は残してあるので、必要時に
  // この shortcut 定義を戻せば再有効化できる。
  {
    keys: ["e"],
    displayKey: "e",
    description: "現在記事より上を全既読",
    group: "article",
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
    group: "article",
    handler: async (ctx) => {
      const readBeforeMs = ctx.readBeforeTimestamp ? Date.parse(ctx.readBeforeTimestamp) : null;
      const unreadCount = ctx.list.filter(
        (a) => !isArticleRead(a, ctx.readIds, readBeforeMs),
      ).length;
      if (unreadCount >= 50) {
        const ok = ctx.confirm
          ? await ctx.confirm(`${unreadCount}件の記事を全既読にしますか？`)
          : window.confirm(`${unreadCount}件の記事を全既読にしますか？`);
        if (!ok) return;
      }
      ctx.markAllRead(ctx.selectedFeedId);
    },
  },
  {
    keys: ["u"],
    displayKey: "u",
    description: "未読フィルター切替",
    group: "filter",
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
    group: "filter",
    handler: (ctx) => {
      ctx.toggleBookmarkOnly();
      ctx.showToast(filterToastMsg(ctx.bookmarkOnly, "ブックマークフィルター"));
    },
  },
  {
    keys: ["T"],
    displayKey: "T",
    description: "リーディングリストフィルター切替",
    group: "filter",
    handler: (ctx) => {
      ctx.toggleReadingListOnly();
      ctx.showToast(filterToastMsg(ctx.readingListOnly, "リーディングリストフィルター"));
    },
  },
  {
    keys: ["I"],
    displayKey: "I",
    description: "いいねフィルター切替",
    group: "filter",
    handler: (ctx) => {
      ctx.toggleLikeOnly();
      ctx.showToast(filterToastMsg(ctx.likeOnly, "いいねフィルター"));
    },
  },
  {
    keys: ["N"],
    displayKey: "N",
    description: "メモありフィルター切替",
    group: "filter",
    handler: (ctx) => {
      ctx.toggleNoteOnly();
      ctx.showToast(filterToastMsg(ctx.noteOnly, "メモありフィルター"));
    },
  },
  {
    keys: ["D"],
    displayKey: "D",
    description: "ダイジェストモード切替（全フィード: フィードごとに最新3件）",
    group: "filter",
    handler: (ctx) => {
      ctx.toggleDigestMode();
      ctx.showToast(filterToastMsg(ctx.digestMode, "ダイジェストモード"));
    },
  },
  {
    keys: ["d"],
    displayKey: "d",
    description: "日付フィルター切替",
    group: "filter",
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
    group: "filter",
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
    group: "filter",
    handler: (ctx) => {
      const next = ctx.toggleSortOrder();
      ctx.showToast(`ソート: ${SORT_ORDER_LABELS[next]}`);
    },
  },
  {
    keys: ["c"],
    displayKey: "c",
    description: "リンクをコピー",
    group: "article",
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
    group: "article",
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
    group: "display",
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
    group: "display",
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
    group: "display",
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
    group: "global",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.searchRef.current?.focus();
    },
  },
  {
    keys: ["]", "["],
    displayKey: "] / [",
    description: "次 / 前のフィード",
    group: "navigation",
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
    group: "global",
    handler: (ctx, e) => {
      e.preventDefault();
      ctx.onShowFeedSwitcher();
    },
  },
  { keys: [], displayKey: "?", description: "このヘルプを表示", group: "global" },
  {
    keys: [],
    displayKey: "\\",
    description: "フォーカスモード切替（記事のみ全画面）",
    group: "display",
  },
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

/**
 * Issue #360: キーボードショートカット仕様の Single Source of Truth。
 * `key`・`description`・`group` のシンプルな形式でエクスポートする。
 * 実装詳細（handler）を含まない純粋な仕様定義として利用できる。
 */
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = SHORTCUT_DEFS.map((def) => ({
  key: def.displayKey,
  description: def.description,
  group: def.group,
}));
