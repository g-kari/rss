/**
 * useEngagement#flushBuffer の lost-update 防止 spec。
 *
 * flushBuffer は buffer snapshot を load → await apiFetch → 残りを saveJson で書き戻すが、
 * await 中に recordEngagement (sendBeacon 失敗時) が buffer に末尾追加すると、stale な snapshot
 * 由来の remaining で書き戻して追加分が消える (read-modify-write across await の stale write-back、
 * #1124 と同 class)。await 後に再 load して snapshot を超えた追加分を保持する挙動を固定する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const BUFFER_KEY = "rss-engagement-buffer";

type Deferred = { resolve: () => void };
let deferreds: Deferred[] = [];

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        deferreds.push({ resolve: () => resolve(new Response(null, { status: 200 })) });
      }),
  ),
}));

import { flushBuffer } from "./useEngagement";

type BufferEntry = { articleId: string; feedHash: string; action: string };

function entry(id: string): BufferEntry {
  return { articleId: id, feedHash: "feed-1", action: "like" };
}

function readBuffer(): BufferEntry[] {
  return JSON.parse(localStorage.getItem(BUFFER_KEY) ?? "[]");
}

// happy-dom の組込 localStorage が機能不全のため Map ベース mock を inject する
// (useTtsEngineSetting.test.ts と同 pattern)
let store: Map<string, string>;

describe("flushBuffer — lost-update 防止", () => {
  beforeEach(() => {
    deferreds = [];
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
      },
      configurable: true,
      writable: true,
    });
  });

  it("await 中に追加された entry を消さない (snapshot を超えた末尾追加を保持)", async () => {
    localStorage.setItem(BUFFER_KEY, JSON.stringify([entry("e1"), entry("e2")]));

    const flushPromise = flushBuffer(); // snapshot=[e1,e2] を load → await で停止
    // await 中に recordEngagement 相当の末尾追加 (sendBeacon 失敗時の buffer push を模擬)
    localStorage.setItem(BUFFER_KEY, JSON.stringify([entry("e1"), entry("e2"), entry("e3")]));

    // e1, e2 の送信成功
    deferreds.forEach((d) => d.resolve());
    await flushPromise;

    // e1, e2 は送信済で除去、await 中に追加された e3 は保持される
    expect(readBuffer().map((e) => e.articleId)).toEqual(["e3"]);
  });

  it("空 buffer は no-op", async () => {
    await flushBuffer();
    expect(readBuffer()).toEqual([]);
  });

  it("追加なしの通常 flush は送信済を全除去する", async () => {
    localStorage.setItem(BUFFER_KEY, JSON.stringify([entry("e1"), entry("e2")]));
    const flushPromise = flushBuffer();
    deferreds.forEach((d) => d.resolve());
    await flushPromise;
    expect(readBuffer()).toEqual([]);
  });
});
