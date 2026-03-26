import { test, expect } from "@playwright/test";
import { LruCache } from "../src/lib/lru-cache";

/**
 * LruCache の単体テスト。
 *
 * localStorage は Node.js 環境では利用できないが、
 * storage ヘルパーが例外を catch して無視するため、
 * in-memory の Map ベースの LRU 動作を検証できる。
 */

test.describe("LruCache — 基本動作", () => {
  test("set した値を get で取得できる", () => {
    const cache = new LruCache("test:", 3);
    cache.set("a", "value-a");
    expect(cache.get("a")).toBe("value-a");
  });

  test("存在しないキーは null を返す", () => {
    const cache = new LruCache("test:", 3);
    expect(cache.get("missing")).toBeNull();
  });

  test("同じキーを再 set すると値が更新される", () => {
    const cache = new LruCache("test:", 3);
    cache.set("a", "v1");
    cache.set("a", "v2");
    expect(cache.get("a")).toBe("v2");
  });
});

test.describe("LruCache — maxSize に達したときの eviction", () => {
  test("maxSize 超過時に最古のエントリが evict される (FIFO の場合)", () => {
    const cache = new LruCache("test:", 3);
    cache.set("a", "va");
    cache.set("b", "vb");
    cache.set("c", "vc");
    // 容量満杯のまま d を追加 → 最古 'a' が evict されるはず
    cache.set("d", "vd");
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("vb");
    expect(cache.get("c")).toBe("vc");
    expect(cache.get("d")).toBe("vd");
  });

  test("maxSize が 1 のキャッシュは 1 つしか保持しない", () => {
    const cache = new LruCache("test:", 1);
    cache.set("a", "va");
    cache.set("b", "vb");
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("vb");
  });
});

test.describe("LruCache — LRU 挙動: get がアクセス順を更新する", () => {
  test("get でアクセスしたエントリは最近使用済みになり evict されない", () => {
    const cache = new LruCache("test:", 3);
    cache.set("a", "va");
    cache.set("b", "vb");
    cache.set("c", "vc");

    // 'a' にアクセスして「最近使用済み」に昇格させる
    expect(cache.get("a")).toBe("va");

    // 新しいエントリ 'd' を追加 → 最古（アクセスしていない 'b'）が evict される
    cache.set("d", "vd");

    // 'a' はアクセス済みなので残っているはず
    expect(cache.get("a")).toBe("va");
    // 'b' は最後にアクセスされていないため evict される
    expect(cache.get("b")).toBeNull();
    expect(cache.get("c")).toBe("vc");
    expect(cache.get("d")).toBe("vd");
  });

  test("複数回アクセスすると常に最近使用済みに更新される", () => {
    const cache = new LruCache("test:", 3);
    cache.set("a", "va");
    cache.set("b", "vb");
    cache.set("c", "vc");

    // 'a' → 'b' → 'a' の順でアクセス → LRU 順は c, b, a（c が最古）
    cache.get("a");
    cache.get("b");
    cache.get("a");

    // 'd' を追加 → 最古の 'c' が evict される
    cache.set("d", "vd");
    expect(cache.get("c")).toBeNull();
    expect(cache.get("b")).toBe("vb");
    expect(cache.get("a")).toBe("va");
    expect(cache.get("d")).toBe("vd");
  });

  test("get が LRU 順を更新しない場合（旧バグ）との違い", () => {
    // 旧実装では get がアクセス順を更新しなかったため:
    // set a, b, c → get a (アクセスしても順は変わらず a が最古のまま)
    // set d → a が evict されてしまっていた
    //
    // 修正後は get a により a が最近使用済みになるため、
    // set d では b が evict される。

    const cache = new LruCache("test:", 3);
    cache.set("x", "vx");
    cache.set("y", "vy");
    cache.set("z", "vz");

    // 最初に挿入した 'x' にアクセス
    expect(cache.get("x")).toBe("vx");

    // 新しいエントリ 'w' を追加
    cache.set("w", "vw");

    // 修正後: 'x' はアクセス済みなので残っているはず（旧バグでは evict された）
    expect(cache.get("x")).toBe("vx");
    // 'y' が evict されているはず
    expect(cache.get("y")).toBeNull();
  });
});

test.describe("LruCache — 上書き (set で既存キーを更新)", () => {
  test("既存キーを set すると LRU 位置が末尾に移動する", () => {
    const cache = new LruCache("test:", 3);
    cache.set("a", "va");
    cache.set("b", "vb");
    cache.set("c", "vc");

    // 'a' を上書き → 'a' が最新になる
    cache.set("a", "va2");

    // 'd' を追加 → 最古の 'b' が evict される
    cache.set("d", "vd");

    expect(cache.get("a")).toBe("va2");
    expect(cache.get("b")).toBeNull();
    expect(cache.get("c")).toBe("vc");
    expect(cache.get("d")).toBe("vd");
  });
});
