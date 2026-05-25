/**
 * LruCache の flush() try/finally エラー耐性 spec (#821)
 *
 * 既存の `e2e/lru-cache.spec.ts` は in-memory 動作 (set/get/eviction/LRU) を網羅するが、
 * `flush()` の **storageSet throw 時に finally で pending が確実にクリアされる** 挙動は
 * playwright/test の制約 (vi.spyOn 不在) で verify されていなかった。
 *
 * 本 spec は vitest + `vi.mock("./storage", ...)` で `storageSet` / `storageRemove` を
 * 差し替え、以下の 4 ケースで flush の try/finally エラー耐性を固定する:
 *   1. 基本 flush: pending に追加 → microtask 完了 → storageSet が呼ばれて pending 空
 *   2. storageSet throw 耐性: throw mock → flush 例外 → finally で pending クリア
 *   3. 次回 flush 正常動作: throw 後の次回 flush が二重書き込みしない
 *   4. null 値 (削除): pending に null 設定 → storageRemove 呼出 + pending クリア
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const storageSet = vi.fn<(key: string, value: string) => void>();
const storageRemove = vi.fn<(key: string) => void>();
const storageGet = vi.fn<(key: string) => string | null>(() => null);
const storageListKeys = vi.fn<(prefix?: string) => string[]>(() => []);

vi.mock("./storage", () => ({
  STORAGE_KEYS: {
    CONTENT_CACHE_PREFIX: "rss-content:",
    AI_CACHE_PREFIX: "rss-ai:",
    AI_TRANSLATE_CACHE_PREFIX: "rss-ai-translate:",
  },
  storageGet: (key: string) => storageGet(key),
  storageSet: (key: string, value: string) => storageSet(key, value),
  storageRemove: (key: string) => storageRemove(key),
  storageListKeys: (prefix?: string) => storageListKeys(prefix),
}));

// dynamic import で vi.mock の hoist 適用後に LruCache を取得
const { LruCache } = await import("./lru-cache");

/**
 * `queueMicrotask` を override して schedule された callback を配列に capture する。
 *
 * 真の `queueMicrotask` を使うと callback 内 throw が unhandled rejection 化して
 * vitest が test を fail させる。flush の throw 耐性を verify したい本 spec では
 * 「callback を同期実行 + 個別 try/catch」が必要なため、override で控除する。
 */
const pendingMicrotasks: Array<() => void> = [];
const originalQueueMicrotask = globalThis.queueMicrotask;

beforeEach(() => {
  storageSet.mockReset();
  storageRemove.mockReset();
  storageGet.mockReset();
  storageListKeys.mockReset();
  storageGet.mockReturnValue(null);
  storageListKeys.mockReturnValue([]);
  storageSet.mockImplementation(() => {});
  storageRemove.mockImplementation(() => {});
  pendingMicrotasks.length = 0;
  globalThis.queueMicrotask = ((cb: VoidFunction) => {
    pendingMicrotasks.push(cb as () => void);
  }) as typeof queueMicrotask;
});

afterEach(() => {
  globalThis.queueMicrotask = originalQueueMicrotask;
});

/**
 * captured microtasks を同期実行する。各 callback の throw は捕捉して sink。
 * 戻り値: throw された Error 配列 (test 側で挙動 verify 可能)
 */
function runMicrotasks(): Error[] {
  const errors: Error[] = [];
  const tasks = pendingMicrotasks.splice(0, pendingMicrotasks.length);
  for (const task of tasks) {
    try {
      task();
    } catch (err) {
      errors.push(err as Error);
    }
  }
  return errors;
}

describe("LruCache.flush() — try/finally エラー耐性 (#821)", () => {
  it("基本: set → microtask flush で storageSet が呼ばれて pending がクリアされる", () => {
    const cache = new LruCache("test:", 3);
    cache.set("a", "value-a");
    expect(storageSet).not.toHaveBeenCalled(); // microtask 前は未発火

    const errs = runMicrotasks();
    expect(errs).toEqual([]);

    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("test:a", "value-a");

    // pending クリア確認: 次回 set 後の 1 microtask で storageSet が **新しい entry 1 件** だけ呼ばれる
    storageSet.mockClear();
    cache.set("b", "value-b");
    runMicrotasks();
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("test:b", "value-b");
  });

  it("storageSet throw 耐性: throw しても finally で pending がクリアされる", () => {
    const cache = new LruCache("test:", 3);
    storageSet.mockImplementationOnce(() => {
      throw new Error("storage full");
    });

    cache.set("a", "value-a");

    // microtask 実行で flush 例外を試行 → finally で pending クリアされる挙動を verify
    const errs = runMicrotasks();
    // flush の try/finally により throw が伝播する (try ブロック内で発生 → finally 実行 → 再 throw)
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toBe("storage full");

    // storageSet は 1 回呼ばれた (= flush 経路に入った)
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("test:a", "value-a");

    // pending クリア verify: 次回 set で別 key だけが書き込まれる
    // "a" が pending に残っていれば storageSet が 2 回呼ばれる (= finally クリアされていない bug シグナル)
    storageSet.mockClear();
    storageSet.mockImplementation(() => {}); // 次回は throw しない
    cache.set("b", "value-b");
    const errs2 = runMicrotasks();
    expect(errs2).toEqual([]);
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("test:b", "value-b");
  });

  it("次回 flush 正常動作: throw 後の次回 flush が二重書き込みしない", () => {
    const cache = new LruCache("test:", 3);
    // 1 回目の flush で storageSet が throw する設定
    storageSet.mockImplementationOnce(() => {
      throw new Error("quota exceeded");
    });

    cache.set("a", "v1");
    runMicrotasks(); // 1 回目: throw されるが finally で pending クリア

    // 1 回目: storageSet が呼ばれて throw、finally で pending クリア
    expect(storageSet).toHaveBeenCalledTimes(1);

    // 2 回目: storageSet は throw しない default 実装に戻る
    storageSet.mockClear();
    cache.set("a", "v2"); // 同 key を更新
    runMicrotasks();

    // pending クリア済なので "a" の最新値だけが書き込まれる (二重書き込みなし)
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("test:a", "v2");
  });

  it("null 値 (削除): maxSize 超過の evict で storageRemove が呼ばれる", () => {
    const cache = new LruCache("test:", 2);
    cache.set("a", "va");
    cache.set("b", "vb");
    runMicrotasks();
    // ここまでで storageSet 2 回 (a / b)
    expect(storageSet).toHaveBeenCalledTimes(2);

    storageSet.mockClear();
    storageRemove.mockClear();

    // maxSize=2 で 3 件目 "c" を追加 → 最古 "a" が evict され pending に null 設定される
    cache.set("c", "vc");
    runMicrotasks();

    // storageRemove が "a" について 1 回呼ばれる (= null 値 → storageRemove 分岐)
    expect(storageRemove).toHaveBeenCalledTimes(1);
    expect(storageRemove).toHaveBeenCalledWith("test:a");
    // storageSet は新規 "c" について 1 回呼ばれる
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("test:c", "vc");
  });

  it("storageRemove throw 耐性: throw しても finally で pending がクリアされる", () => {
    const cache = new LruCache("test:", 2);
    cache.set("a", "va");
    cache.set("b", "vb");
    runMicrotasks();

    storageSet.mockClear();
    storageRemove.mockClear();
    storageRemove.mockImplementationOnce(() => {
      throw new Error("remove failed");
    });

    // 3 件目で "a" evict → storageRemove("test:a") が throw する
    cache.set("c", "vc");
    const errs = runMicrotasks();
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toBe("remove failed");

    // storageRemove は throw した (呼ばれた事実は記録される)
    expect(storageRemove).toHaveBeenCalledTimes(1);

    // pending クリア verify: 次回 set が二重書き込みしない
    storageSet.mockClear();
    storageRemove.mockClear();
    storageRemove.mockImplementation(() => {}); // 次回は throw しない
    cache.set("d", "vd");
    const errs2 = runMicrotasks();
    expect(errs2).toEqual([]);
    // pending クリア済なので新規 "d" だけ書き込まれる
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("test:d", "vd");
  });
});
