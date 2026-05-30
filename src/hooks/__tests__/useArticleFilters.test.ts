/**
 * useArticleFilters (#912 Phase A) の vitest ユニットテスト
 *
 * テスト対象: src/hooks/useArticleFilters.ts
 *
 * 検証項目:
 * - 初期状態のデフォルト値
 * - unread / bookmark / readingList / like / note / digestMode フィルターの toggle
 * - search query の updateQuery
 * - dateRange の cycleDateRange
 * - readingTimeRange の cycleReadingTimeRange
 * - authorFilter / categoryFilter の個別セット
 * - 複数フィルターの組み合わせ
 * - feedId / selectedGroupId 変更時のリセット
 * - resetAllFilters による一括リセット
 *
 * localStorage は happy-dom 組込版を Map ベースの mock に差し替える（useTtsEngineSetting pattern）。
 *
 * getFeedViewStorageKey の仕様:
 *   activeFeedView === "articles" のとき → baseKey をそのまま返す（プレフィックスなし）
 *   activeFeedView !== "articles" のとき → `${baseKey}:${feedView}` を返す
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useArticleFilters } from "../useArticleFilters";
import { STORAGE_KEYS } from "../../lib/storage";

// ---------------------------------------------------------------------------
// localStorage mock (happy-dom 組込版は --localstorage-file 設定で機能不全)
// ---------------------------------------------------------------------------
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  store.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
function makeOptions(
  overrides: {
    feedId?: string | null;
    selectedGroupId?: string | null;
    resetPage?: () => void;
    activeFeedView?: "articles" | "pictures" | "videos" | "social";
  } = {},
) {
  return {
    feedId: overrides.feedId ?? "feed-1",
    selectedGroupId: overrides.selectedGroupId ?? null,
    resetPage: overrides.resetPage ?? vi.fn(),
    activeFeedView: overrides.activeFeedView,
  };
}

// ---------------------------------------------------------------------------
// テスト群
// ---------------------------------------------------------------------------

describe("useArticleFilters (#912 Phase A)", () => {
  // -------------------------------------------------------------------------
  // 初期状態
  // -------------------------------------------------------------------------
  describe("初期状態のデフォルト値", () => {
    it("bool フィルターはすべて false", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.unreadOnly).toBe(false);
      expect(result.current.bookmarkOnly).toBe(false);
      expect(result.current.readingListOnly).toBe(false);
      expect(result.current.likeOnly).toBe(false);
      expect(result.current.noteOnly).toBe(false);
      expect(result.current.digestMode).toBe(false);
    });

    it("dateRange のデフォルトは 'all'", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.dateRange).toBe("all");
    });

    it("readingTimeRange のデフォルトは 'all'", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.readingTimeRange).toBe("all");
    });

    it("rawQuery のデフォルトは空文字列", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.rawQuery).toBe("");
    });

    it("authorFilter のデフォルトは null", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.authorFilter).toBeNull();
    });

    it("categoryFilter のデフォルトは null", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.categoryFilter).toBeNull();
    });

    it("localStorage に unreadOnly=1 が保存されていれば true で初期化", () => {
      // articles view では getFeedViewStorageKey がベースキーをそのまま返す（プレフィックスなし）
      store.set(STORAGE_KEYS.UNREAD_ONLY, "1");
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.unreadOnly).toBe(true);
    });

    it("localStorage に dateRange='week' が保存されていれば week で初期化", () => {
      store.set(STORAGE_KEYS.DATE_RANGE, "week");
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.dateRange).toBe("week");
    });
  });

  // -------------------------------------------------------------------------
  // unread フィルター
  // -------------------------------------------------------------------------
  describe("unread フィルター (toggleUnreadOnly)", () => {
    it("toggle で false → true になる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.unreadOnly).toBe(false);
      act(() => result.current.toggleUnreadOnly());
      expect(result.current.unreadOnly).toBe(true);
    });

    it("2 回 toggle で false に戻る", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleUnreadOnly());
      act(() => result.current.toggleUnreadOnly());
      expect(result.current.unreadOnly).toBe(false);
    });

    it("toggle で localStorage に '1' が書き込まれる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleUnreadOnly());
      expect(store.get(STORAGE_KEYS.UNREAD_ONLY)).toBe("1");
    });

    it("toggle で resetPage が呼ばれる", () => {
      const resetPage = vi.fn();
      const { result } = renderHook(() => useArticleFilters(makeOptions({ resetPage })));
      act(() => result.current.toggleUnreadOnly());
      expect(resetPage).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // bookmark フィルター
  // -------------------------------------------------------------------------
  describe("bookmark フィルター (toggleBookmarkOnly)", () => {
    it("toggle で false → true になる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleBookmarkOnly());
      expect(result.current.bookmarkOnly).toBe(true);
    });

    it("toggle で localStorage に '1' が書き込まれる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleBookmarkOnly());
      expect(store.get(STORAGE_KEYS.BOOKMARK_ONLY)).toBe("1");
    });
  });

  // -------------------------------------------------------------------------
  // readingList フィルター
  // -------------------------------------------------------------------------
  describe("readingList フィルター (toggleReadingListOnly)", () => {
    it("toggle で false → true になる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleReadingListOnly());
      expect(result.current.readingListOnly).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // like フィルター
  // -------------------------------------------------------------------------
  describe("like フィルター (toggleLikeOnly)", () => {
    it("toggle で false → true になる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleLikeOnly());
      expect(result.current.likeOnly).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // note フィルター
  // -------------------------------------------------------------------------
  describe("note フィルター (toggleNoteOnly)", () => {
    it("toggle で false → true になる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleNoteOnly());
      expect(result.current.noteOnly).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // digestMode フィルター
  // -------------------------------------------------------------------------
  describe("digestMode フィルター (toggleDigestMode)", () => {
    it("toggle で false → true になる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleDigestMode());
      expect(result.current.digestMode).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // search クエリ
  // -------------------------------------------------------------------------
  describe("search フィルター (updateQuery)", () => {
    it("updateQuery で rawQuery が更新される", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.updateQuery("React"));
      expect(result.current.rawQuery).toBe("React");
    });

    it("updateQuery で resetPage が呼ばれる", () => {
      const resetPage = vi.fn();
      const { result } = renderHook(() => useArticleFilters(makeOptions({ resetPage })));
      act(() => result.current.updateQuery("RSS"));
      expect(resetPage).toHaveBeenCalled();
    });

    it("updateQuery を空文字列で呼ぶと rawQuery がクリアされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.updateQuery("hello"));
      act(() => result.current.updateQuery(""));
      expect(result.current.rawQuery).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // dateRange
  // -------------------------------------------------------------------------
  describe("dateRange (cycleDateRange)", () => {
    it("cycleDateRange: all → today", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.dateRange).toBe("all");
      let next: string | undefined;
      act(() => {
        next = result.current.cycleDateRange();
      });
      expect(next).toBe("today");
      expect(result.current.dateRange).toBe("today");
    });

    it("cycleDateRange: today → week", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.cycleDateRange()); // all → today
      let next: string | undefined;
      act(() => {
        next = result.current.cycleDateRange(); // today → week
      });
      expect(next).toBe("week");
      expect(result.current.dateRange).toBe("week");
    });

    it("cycleDateRange で localStorage が更新される", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.cycleDateRange());
      expect(store.get(STORAGE_KEYS.DATE_RANGE)).toBe("today");
    });

    it("cycleDateRange で resetPage が呼ばれる", () => {
      const resetPage = vi.fn();
      const { result } = renderHook(() => useArticleFilters(makeOptions({ resetPage })));
      act(() => result.current.cycleDateRange());
      expect(resetPage).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // readingTimeRange
  // -------------------------------------------------------------------------
  describe("readingTimeRange (cycleReadingTimeRange)", () => {
    it("cycleReadingTimeRange: all → short", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      expect(result.current.readingTimeRange).toBe("all");
      let next: string | undefined;
      act(() => {
        next = result.current.cycleReadingTimeRange();
      });
      expect(next).toBe("short");
      expect(result.current.readingTimeRange).toBe("short");
    });

    it("cycleReadingTimeRange で localStorage が更新される", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.cycleReadingTimeRange());
      expect(store.get(STORAGE_KEYS.READING_TIME_RANGE)).toBe("short");
    });

    it("cycleReadingTimeRange で resetPage が呼ばれる", () => {
      const resetPage = vi.fn();
      const { result } = renderHook(() => useArticleFilters(makeOptions({ resetPage })));
      act(() => result.current.cycleReadingTimeRange());
      expect(resetPage).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // authorFilter / categoryFilter
  // -------------------------------------------------------------------------
  describe("authorFilter / categoryFilter", () => {
    it("setAuthorFilter で authorFilter が更新される", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.setAuthorFilter("Author A"));
      expect(result.current.authorFilter).toBe("Author A");
    });

    it("setCategoryFilter で categoryFilter が更新される", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.setCategoryFilter("Tech"));
      expect(result.current.categoryFilter).toBe("Tech");
    });

    it("setAuthorFilter(null) で authorFilter がクリアされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.setAuthorFilter("Author A"));
      act(() => result.current.setAuthorFilter(null));
      expect(result.current.authorFilter).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 複数フィルターの組み合わせ
  // -------------------------------------------------------------------------
  describe("複数フィルターの組み合わせ", () => {
    it("unread + bookmark フィルターを同時に有効化できる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleUnreadOnly());
      act(() => result.current.toggleBookmarkOnly());
      expect(result.current.unreadOnly).toBe(true);
      expect(result.current.bookmarkOnly).toBe(true);
    });

    it("unread + search query を同時に設定できる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleUnreadOnly());
      act(() => result.current.updateQuery("Next.js"));
      expect(result.current.unreadOnly).toBe(true);
      expect(result.current.rawQuery).toBe("Next.js");
    });

    it("authorFilter + categoryFilter + unread を同時に設定できる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => {
        result.current.setAuthorFilter("Author A");
        result.current.setCategoryFilter("Tech");
        result.current.toggleUnreadOnly();
      });
      expect(result.current.authorFilter).toBe("Author A");
      expect(result.current.categoryFilter).toBe("Tech");
      expect(result.current.unreadOnly).toBe(true);
    });

    it("dateRange cycle + unread フィルターの組み合わせ", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleUnreadOnly());
      act(() => result.current.cycleDateRange());
      expect(result.current.unreadOnly).toBe(true);
      expect(result.current.dateRange).toBe("today");
    });
  });

  // -------------------------------------------------------------------------
  // feedId / selectedGroupId 変更時のリセット
  // -------------------------------------------------------------------------
  describe("feedId 変更時のリセット", () => {
    it("feedId が変わると rawQuery がリセットされる", () => {
      let feedId = "feed-1";
      const resetPage = vi.fn();
      const { result, rerender } = renderHook(() =>
        useArticleFilters(makeOptions({ feedId, resetPage })),
      );
      act(() => result.current.updateQuery("hello"));
      expect(result.current.rawQuery).toBe("hello");

      feedId = "feed-2";
      rerender();
      expect(result.current.rawQuery).toBe("");
    });

    it("feedId が変わると authorFilter がリセットされる", () => {
      let feedId = "feed-1";
      const { result, rerender } = renderHook(() => useArticleFilters(makeOptions({ feedId })));
      act(() => result.current.setAuthorFilter("Author A"));
      expect(result.current.authorFilter).toBe("Author A");

      feedId = "feed-2";
      rerender();
      expect(result.current.authorFilter).toBeNull();
    });

    it("feedId が変わると categoryFilter がリセットされる", () => {
      let feedId = "feed-1";
      const { result, rerender } = renderHook(() => useArticleFilters(makeOptions({ feedId })));
      act(() => result.current.setCategoryFilter("Tech"));

      feedId = "feed-2";
      rerender();
      expect(result.current.categoryFilter).toBeNull();
    });

    it("feedId が変わると resetPage が呼ばれる", () => {
      let feedId = "feed-1";
      const resetPage = vi.fn();
      const { rerender } = renderHook(() => useArticleFilters(makeOptions({ feedId, resetPage })));

      resetPage.mockClear();
      feedId = "feed-2";
      rerender();
      expect(resetPage).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // resetAllFilters
  // -------------------------------------------------------------------------
  describe("resetAllFilters", () => {
    it("すべての bool フィルターが false にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => {
        result.current.toggleUnreadOnly();
        result.current.toggleBookmarkOnly();
        result.current.toggleLikeOnly();
      });
      expect(result.current.unreadOnly).toBe(true);

      act(() => result.current.resetAllFilters());
      expect(result.current.unreadOnly).toBe(false);
      expect(result.current.bookmarkOnly).toBe(false);
      expect(result.current.likeOnly).toBe(false);
    });

    it("dateRange が 'all' にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.cycleDateRange()); // all → today
      expect(result.current.dateRange).toBe("today");

      act(() => result.current.resetAllFilters());
      expect(result.current.dateRange).toBe("all");
    });

    it("readingTimeRange が 'all' にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.cycleReadingTimeRange()); // all → short
      expect(result.current.readingTimeRange).toBe("short");

      act(() => result.current.resetAllFilters());
      expect(result.current.readingTimeRange).toBe("all");
    });

    it("rawQuery が '' にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.updateQuery("hello"));
      act(() => result.current.resetAllFilters());
      expect(result.current.rawQuery).toBe("");
    });

    it("authorFilter が null にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.setAuthorFilter("Author A"));
      act(() => result.current.resetAllFilters());
      expect(result.current.authorFilter).toBeNull();
    });

    it("categoryFilter が null にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.setCategoryFilter("Tech"));
      act(() => result.current.resetAllFilters());
      expect(result.current.categoryFilter).toBeNull();
    });

    it("localStorage の bool フィルターが '0' にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.toggleUnreadOnly());
      expect(store.get(STORAGE_KEYS.UNREAD_ONLY)).toBe("1");

      act(() => result.current.resetAllFilters());
      expect(store.get(STORAGE_KEYS.UNREAD_ONLY)).toBe("0");
    });

    it("localStorage の dateRange が 'all' にリセットされる", () => {
      const { result } = renderHook(() => useArticleFilters(makeOptions()));
      act(() => result.current.cycleDateRange());
      act(() => result.current.resetAllFilters());
      expect(store.get(STORAGE_KEYS.DATE_RANGE)).toBe("all");
    });

    it("resetAllFilters で resetPage が呼ばれる", () => {
      const resetPage = vi.fn();
      const { result } = renderHook(() => useArticleFilters(makeOptions({ resetPage })));
      resetPage.mockClear();
      act(() => result.current.resetAllFilters());
      expect(resetPage).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // activeFeedView 別の localStorage 分離
  // -------------------------------------------------------------------------
  describe("activeFeedView 別の localStorage キー分離", () => {
    it("articles view では baseKey をそのまま使い、pictures view では baseKey:pictures を使う", () => {
      // articles view で unreadOnly をセット
      const { result: articlesResult } = renderHook(() =>
        useArticleFilters(makeOptions({ activeFeedView: "articles" })),
      );
      act(() => articlesResult.current.toggleUnreadOnly());
      // articles view のキーは STORAGE_KEYS.UNREAD_ONLY そのまま（プレフィックスなし）
      expect(store.get(STORAGE_KEYS.UNREAD_ONLY)).toBe("1");

      // pictures view の初期 unreadOnly は false（別キーを読むため影響なし）
      const { result: picturesResult } = renderHook(() =>
        useArticleFilters(makeOptions({ activeFeedView: "pictures" })),
      );
      expect(picturesResult.current.unreadOnly).toBe(false);
    });

    it("pictures view のキーは 'baseKey:pictures' 形式", () => {
      const { result } = renderHook(() =>
        useArticleFilters(makeOptions({ activeFeedView: "pictures" })),
      );
      act(() => result.current.toggleUnreadOnly());
      // pictures view のキーは `${STORAGE_KEYS.UNREAD_ONLY}:pictures`
      expect(store.get(`${STORAGE_KEYS.UNREAD_ONLY}:pictures`)).toBe("1");
    });
  });
});
