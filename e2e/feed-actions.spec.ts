import { test, expect } from "@playwright/test";
import { buildFeedActions } from "../src/components/feed-item/feedActions";
import type { Feed, FeedGroup } from "../src/types";
import { makeFeed } from "./helpers/feed";

/**
 * buildFeedActions の単体テスト。
 *
 * FeedItemComponent.tsx の actions 配列を切り出した純粋関数（UI イベントハンドラの組み立て）。
 * 「動作を変えない」ことを保証するため、各 action の存在・順序・visible / className の挙動・
 * onClick が対応するハンドラを呼ぶことを検証する。
 */

interface BuilderOverrides {
  feed?: Feed;
  count?: number;
  isPinned?: boolean;
  groups?: FeedGroup[];
  loadingAction?: "retry" | "reinfer" | null;
  hasFilter?: boolean;
  isMuted?: boolean;
  // ハンドラ
  onTogglePriority?: () => void;
  onToggleNsfw?: () => void;
  onFilterSave?: (f: unknown) => Promise<void>;
  onSetCategory?: (c: string | null) => Promise<void>;
  onSetGroup?: (g: string | null) => Promise<void>;
  onSetView?: (v: unknown) => Promise<void>;
  onSetDigestLimit?: (n: number | null) => Promise<void>;
  onMute?: (m: string | null) => Promise<void>;
  onReinfer?: () => Promise<void>;
  setMenuOpen?: (open: boolean) => void;
  setDetailOpen?: (open: boolean) => void;
  setFilterModalOpen?: (open: boolean) => void;
  startCategoryEdit?: () => void;
  setGroupOpen?: (open: boolean) => void;
  setViewOpen?: (open: boolean) => void;
  setDigestOpen?: (open: boolean) => void;
  setMuteOpen?: (open: boolean) => void;
  onTogglePin?: () => void;
  onMarkAllRead?: () => void;
  handleRetry?: () => void;
  handleReinfer?: () => Promise<void>;
  onDelete?: () => void;
  confirmDelete?: () => Promise<boolean>;
}

function makeProps(overrides: BuilderOverrides = {}) {
  const noop = () => {};
  const noopAsync = async () => {};
  return {
    feed: overrides.feed ?? makeFeed(),
    count: overrides.count ?? 0,
    isPinned: overrides.isPinned ?? false,
    groups: overrides.groups,
    loadingAction: overrides.loadingAction ?? null,
    hasFilter: overrides.hasFilter ?? false,
    isMuted: overrides.isMuted ?? false,
    onTogglePriority: overrides.onTogglePriority,
    onToggleNsfw: overrides.onToggleNsfw,
    onFilterSave: overrides.onFilterSave,
    onSetCategory: overrides.onSetCategory,
    onSetGroup: overrides.onSetGroup,
    onSetView: overrides.onSetView,
    onSetDigestLimit: overrides.onSetDigestLimit,
    onMute: overrides.onMute,
    onReinfer: overrides.onReinfer,
    setMenuOpen: overrides.setMenuOpen ?? noop,
    setDetailOpen: overrides.setDetailOpen ?? noop,
    setFilterModalOpen: overrides.setFilterModalOpen ?? noop,
    startCategoryEdit: overrides.startCategoryEdit ?? noop,
    setGroupOpen: overrides.setGroupOpen ?? noop,
    setViewOpen: overrides.setViewOpen ?? noop,
    setDigestOpen: overrides.setDigestOpen ?? noop,
    setMuteOpen: overrides.setMuteOpen ?? noop,
    onTogglePin: overrides.onTogglePin ?? noop,
    onMarkAllRead: overrides.onMarkAllRead ?? noop,
    handleRetry: overrides.handleRetry ?? noop,
    handleReinfer: overrides.handleReinfer ?? noopAsync,
    onDelete: overrides.onDelete ?? noop,
    confirmDelete: overrides.confirmDelete ?? (async () => true),
  };
}

test.describe("buildFeedActions — 必須 actions", () => {
  test("ハンドラを全て与えた場合に既知のキーが定義された順序で含まれる", () => {
    const actions = buildFeedActions(
      makeProps({
        onTogglePriority: () => {},
        onToggleNsfw: () => {},
        onFilterSave: async () => {},
        onSetCategory: async () => {},
        onSetGroup: async () => {},
        onSetView: async () => {},
        onSetDigestLimit: async () => {},
        onMute: async () => {},
        onReinfer: async () => {},
        feed: makeFeed({ isScraping: true }),
        count: 5,
      }),
    );

    const keys = actions.map((a) => a.key);
    expect(keys).toEqual([
      "detail",
      "priority",
      "nsfw",
      "filter",
      "category",
      "group",
      "view",
      "digest",
      "mute",
      "pin",
      "read",
      "retry",
      "reinfer",
      "delete",
    ]);
  });

  test("どの action もキーとラベルとアイコンと onClick を持つ", () => {
    const actions = buildFeedActions(makeProps());
    for (const a of actions) {
      expect(a.key).toBeTruthy();
      expect(a.label).toBeTruthy();
      expect(a.icon).toBeTruthy();
      expect(typeof a.onClick).toBe("function");
    }
  });
});

test.describe("buildFeedActions — visible / show フラグ", () => {
  test("optional ハンドラ未指定の action は show:false になる", () => {
    const actions = buildFeedActions(makeProps());
    const map = new Map(actions.map((a) => [a.key, a] as const));
    expect(map.get("priority")?.show).toBe(false);
    expect(map.get("nsfw")?.show).toBe(false);
    expect(map.get("filter")?.show).toBe(false);
    expect(map.get("category")?.show).toBe(false);
    expect(map.get("group")?.show).toBe(false);
    expect(map.get("view")?.show).toBe(false);
    expect(map.get("digest")?.show).toBe(false);
    expect(map.get("mute")?.show).toBe(false);
  });

  test("count が 0 の場合 read action は show:false", () => {
    const actions = buildFeedActions(makeProps({ count: 0 }));
    const read = actions.find((a) => a.key === "read");
    expect(read?.show).toBe(false);
  });

  test("count > 0 の場合 read action は show が undefined または true", () => {
    const actions = buildFeedActions(makeProps({ count: 1 }));
    const read = actions.find((a) => a.key === "read");
    expect(read?.show).not.toBe(false);
  });

  test("isScraping=false または onReinfer 無しでは reinfer は show:false", () => {
    const a1 = buildFeedActions(
      makeProps({ feed: makeFeed({ isScraping: false }), onReinfer: async () => {} }),
    );
    expect(a1.find((a) => a.key === "reinfer")?.show).toBe(false);

    const a2 = buildFeedActions(makeProps({ feed: makeFeed({ isScraping: true }) }));
    expect(a2.find((a) => a.key === "reinfer")?.show).toBe(false);
  });

  test("isScraping=true かつ onReinfer 有りで reinfer が表示される", () => {
    const actions = buildFeedActions(
      makeProps({ feed: makeFeed({ isScraping: true }), onReinfer: async () => {} }),
    );
    expect(actions.find((a) => a.key === "reinfer")?.show).not.toBe(false);
  });

  test("detail / pin / retry / delete は常に show を抑制しない", () => {
    const actions = buildFeedActions(makeProps());
    expect(actions.find((a) => a.key === "detail")?.show).not.toBe(false);
    expect(actions.find((a) => a.key === "pin")?.show).not.toBe(false);
    expect(actions.find((a) => a.key === "retry")?.show).not.toBe(false);
    expect(actions.find((a) => a.key === "delete")?.show).not.toBe(false);
  });
});

test.describe("buildFeedActions — onClick が対応するハンドラを呼ぶ", () => {
  test("detail.onClick → setDetailOpen(true)", () => {
    let called: boolean | null = null;
    const actions = buildFeedActions(makeProps({ setDetailOpen: (v) => (called = v) }));
    actions.find((a) => a.key === "detail")?.onClick();
    expect(called).toBe(true);
  });

  test("priority.onClick → onTogglePriority", () => {
    let called = false;
    const actions = buildFeedActions(makeProps({ onTogglePriority: () => (called = true) }));
    actions.find((a) => a.key === "priority")?.onClick();
    expect(called).toBe(true);
  });

  test("nsfw.onClick → onToggleNsfw", () => {
    let called = false;
    const actions = buildFeedActions(makeProps({ onToggleNsfw: () => (called = true) }));
    actions.find((a) => a.key === "nsfw")?.onClick();
    expect(called).toBe(true);
  });

  test("filter.onClick → setFilterModalOpen(true)", () => {
    let called: boolean | null = null;
    const actions = buildFeedActions(
      makeProps({
        onFilterSave: async () => {},
        setFilterModalOpen: (v) => (called = v),
      }),
    );
    actions.find((a) => a.key === "filter")?.onClick();
    expect(called).toBe(true);
  });

  test("category.onClick → setMenuOpen(false) + startCategoryEdit", () => {
    let menuClosed = false;
    let started = false;
    const actions = buildFeedActions(
      makeProps({
        onSetCategory: async () => {},
        setMenuOpen: (v) => {
          if (v === false) menuClosed = true;
        },
        startCategoryEdit: () => (started = true),
      }),
    );
    actions.find((a) => a.key === "category")?.onClick();
    expect(menuClosed).toBe(true);
    expect(started).toBe(true);
  });

  test("group.onClick → setMenuOpen(false) + setGroupOpen(true)", () => {
    let menuClosed = false;
    let groupOpened = false;
    const actions = buildFeedActions(
      makeProps({
        onSetGroup: async () => {},
        setMenuOpen: (v) => {
          if (v === false) menuClosed = true;
        },
        setGroupOpen: (v) => {
          if (v === true) groupOpened = true;
        },
      }),
    );
    actions.find((a) => a.key === "group")?.onClick();
    expect(menuClosed).toBe(true);
    expect(groupOpened).toBe(true);
  });

  test("view.onClick → setMenuOpen(false) + setViewOpen(true)", () => {
    let menuClosed = false;
    let viewOpened = false;
    const actions = buildFeedActions(
      makeProps({
        onSetView: async () => {},
        setMenuOpen: (v) => {
          if (v === false) menuClosed = true;
        },
        setViewOpen: (v) => {
          if (v === true) viewOpened = true;
        },
      }),
    );
    actions.find((a) => a.key === "view")?.onClick();
    expect(menuClosed).toBe(true);
    expect(viewOpened).toBe(true);
  });

  test("digest.onClick → setMenuOpen(false) + setDigestOpen(true)", () => {
    let menuClosed = false;
    let digestOpened = false;
    const actions = buildFeedActions(
      makeProps({
        onSetDigestLimit: async () => {},
        setMenuOpen: (v) => {
          if (v === false) menuClosed = true;
        },
        setDigestOpen: (v) => {
          if (v === true) digestOpened = true;
        },
      }),
    );
    actions.find((a) => a.key === "digest")?.onClick();
    expect(menuClosed).toBe(true);
    expect(digestOpened).toBe(true);
  });

  test("mute.onClick — ミュート中なら onMute(null) を呼ぶ", () => {
    let muteValue: string | null | undefined;
    const actions = buildFeedActions(
      makeProps({
        isMuted: true,
        onMute: async (v) => {
          muteValue = v;
        },
      }),
    );
    actions.find((a) => a.key === "mute")?.onClick();
    expect(muteValue).toBeNull();
  });

  test("mute.onClick — ミュート中でなければ setMenuOpen(false) + setMuteOpen(true)", () => {
    let menuClosed = false;
    let muteOpened = false;
    const actions = buildFeedActions(
      makeProps({
        isMuted: false,
        onMute: async () => {},
        setMenuOpen: (v) => {
          if (v === false) menuClosed = true;
        },
        setMuteOpen: (v) => {
          if (v === true) muteOpened = true;
        },
      }),
    );
    actions.find((a) => a.key === "mute")?.onClick();
    expect(menuClosed).toBe(true);
    expect(muteOpened).toBe(true);
  });

  test("pin.onClick → onTogglePin", () => {
    let called = false;
    const actions = buildFeedActions(makeProps({ onTogglePin: () => (called = true) }));
    actions.find((a) => a.key === "pin")?.onClick();
    expect(called).toBe(true);
  });

  test("read.onClick → onMarkAllRead", () => {
    let called = false;
    const actions = buildFeedActions(makeProps({ count: 1, onMarkAllRead: () => (called = true) }));
    actions.find((a) => a.key === "read")?.onClick();
    expect(called).toBe(true);
  });

  test("retry.onClick → handleRetry", () => {
    let called = false;
    const actions = buildFeedActions(makeProps({ handleRetry: () => (called = true) }));
    actions.find((a) => a.key === "retry")?.onClick();
    expect(called).toBe(true);
  });

  test("delete.onClick — confirmDelete が true なら onDelete を呼ぶ", async () => {
    let deleted = false;
    const actions = buildFeedActions(
      makeProps({
        confirmDelete: async () => true,
        onDelete: () => (deleted = true),
      }),
    );
    const onClick = actions.find((a) => a.key === "delete")!.onClick;
    await onClick();
    expect(deleted).toBe(true);
  });

  test("delete.onClick — confirmDelete が false なら onDelete を呼ばない", async () => {
    let deleted = false;
    const actions = buildFeedActions(
      makeProps({
        confirmDelete: async () => false,
        onDelete: () => (deleted = true),
      }),
    );
    const onClick = actions.find((a) => a.key === "delete")!.onClick;
    await onClick();
    expect(deleted).toBe(false);
  });
});

test.describe("buildFeedActions — ラベルの動的生成", () => {
  test("priority のラベルは priority='high' で『スター解除』、未設定で『スター付き』", () => {
    const high = buildFeedActions(
      makeProps({
        feed: makeFeed({ priority: "high" }),
        onTogglePriority: () => {},
      }),
    );
    expect(high.find((a) => a.key === "priority")?.label).toBe("スター解除");

    const low = buildFeedActions(
      makeProps({
        feed: makeFeed(),
        onTogglePriority: () => {},
      }),
    );
    expect(low.find((a) => a.key === "priority")?.label).toBe("スター付き");
  });

  test("nsfw のラベルは feed.nsfw=true で『NSFW解除』、false で『NSFW設定』", () => {
    const on = buildFeedActions(
      makeProps({
        feed: makeFeed({ nsfw: true }),
        onToggleNsfw: () => {},
      }),
    );
    expect(on.find((a) => a.key === "nsfw")?.label).toBe("NSFW解除");

    const off = buildFeedActions(
      makeProps({
        feed: makeFeed(),
        onToggleNsfw: () => {},
      }),
    );
    expect(off.find((a) => a.key === "nsfw")?.label).toBe("NSFW設定");
  });

  test("category のラベルは feed.category 設定時に『カテゴリ: ...』", () => {
    const actions = buildFeedActions(
      makeProps({
        feed: makeFeed({ category: "技術" }),
        onSetCategory: async () => {},
      }),
    );
    expect(actions.find((a) => a.key === "category")?.label).toBe("カテゴリ: 技術");
  });

  test("group のラベルは groupId が groups に存在すれば『グループ: 名前』", () => {
    const groups: FeedGroup[] = [
      { id: "g1", name: "技術", order: 0, createdAt: "2025-01-01T00:00:00Z" },
    ];
    const actions = buildFeedActions(
      makeProps({
        feed: makeFeed({ groupId: "g1" }),
        groups,
        onSetGroup: async () => {},
      }),
    );
    expect(actions.find((a) => a.key === "group")?.label).toBe("グループ: 技術");
  });

  test("view のラベルは feed.view 別に切り替わる", () => {
    const cases: Array<[Feed["view"], string]> = [
      [undefined, "表示: 記事"],
      ["articles", "表示: 記事"],
      ["pictures", "表示: 画像"],
      ["videos", "表示: 動画"],
      ["social", "表示: SNS"],
    ];
    for (const [view, expected] of cases) {
      const actions = buildFeedActions(
        makeProps({
          feed: makeFeed({ view }),
          onSetView: async () => {},
        }),
      );
      expect(actions.find((a) => a.key === "view")?.label).toBe(expected);
    }
  });

  test("digest のラベルは undefined / 0 / 数値で切り替わる", () => {
    const undefDigest = buildFeedActions(makeProps({ onSetDigestLimit: async () => {} }));
    expect(undefDigest.find((a) => a.key === "digest")?.label).toBe("ダイジェスト: デフォルト");

    const zeroDigest = buildFeedActions(
      makeProps({
        feed: makeFeed({ digestLimit: 0 }),
        onSetDigestLimit: async () => {},
      }),
    );
    expect(zeroDigest.find((a) => a.key === "digest")?.label).toBe("ダイジェスト: 全件");

    const tenDigest = buildFeedActions(
      makeProps({
        feed: makeFeed({ digestLimit: 10 }),
        onSetDigestLimit: async () => {},
      }),
    );
    expect(tenDigest.find((a) => a.key === "digest")?.label).toBe("ダイジェスト: 10件");
  });

  test("mute のラベルは isMuted=true で『ミュート解除』、false で『ミュート』", () => {
    const muted = buildFeedActions(makeProps({ isMuted: true, onMute: async () => {} }));
    expect(muted.find((a) => a.key === "mute")?.label).toBe("ミュート解除");

    const notMuted = buildFeedActions(makeProps({ isMuted: false, onMute: async () => {} }));
    expect(notMuted.find((a) => a.key === "mute")?.label).toBe("ミュート");
  });

  test("pin のラベルは isPinned=true で『ピン解除』、false で『ピン留め』", () => {
    expect(
      buildFeedActions(makeProps({ isPinned: true })).find((a) => a.key === "pin")?.label,
    ).toBe("ピン解除");
    expect(
      buildFeedActions(makeProps({ isPinned: false })).find((a) => a.key === "pin")?.label,
    ).toBe("ピン留め");
  });

  test("retry のラベルは feed.fetchError ありで『再試行』、なしで『更新』", () => {
    const err = buildFeedActions(makeProps({ feed: makeFeed({ fetchError: "boom" }) }));
    expect(err.find((a) => a.key === "retry")?.label).toBe("再試行");

    const ok = buildFeedActions(makeProps());
    expect(ok.find((a) => a.key === "retry")?.label).toBe("更新");
  });

  test("reinfer のラベルは loadingAction='reinfer' で『推論中...』", () => {
    const loading = buildFeedActions(
      makeProps({
        feed: makeFeed({ isScraping: true }),
        onReinfer: async () => {},
        loadingAction: "reinfer",
      }),
    );
    expect(loading.find((a) => a.key === "reinfer")?.label).toBe("推論中...");
  });
});

test.describe("buildFeedActions — disabled / variant", () => {
  test("retry は loadingAction='retry' で disabled", () => {
    const actions = buildFeedActions(makeProps({ loadingAction: "retry" }));
    expect(actions.find((a) => a.key === "retry")?.disabled).toBe(true);
  });

  test("reinfer は loadingAction='reinfer' で disabled", () => {
    const actions = buildFeedActions(
      makeProps({
        feed: makeFeed({ isScraping: true }),
        onReinfer: async () => {},
        loadingAction: "reinfer",
      }),
    );
    expect(actions.find((a) => a.key === "reinfer")?.disabled).toBe(true);
  });

  test("retry の variant は feed.fetchError ありで 'danger'", () => {
    const err = buildFeedActions(makeProps({ feed: makeFeed({ fetchError: "boom" }) }));
    expect(err.find((a) => a.key === "retry")?.variant).toBe("danger");
  });

  test("delete は variant='danger'", () => {
    const actions = buildFeedActions(makeProps());
    expect(actions.find((a) => a.key === "delete")?.variant).toBe("danger");
  });
});
