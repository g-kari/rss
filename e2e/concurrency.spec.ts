import { test, expect } from "@playwright/test";
import { pMap, pMapSettled } from "../src/lib/concurrency";

/**
 * concurrency.ts の純粋関数テスト。
 *
 * `pMap` — Promise.all セマンティクス（失敗時は即座にエラーを伝播）
 * `pMapSettled` — Promise.allSettled セマンティクス（失敗分を PromiseSettledResult に収集）
 */

// ==========================================================================
// pMapSettled
// ==========================================================================

test.describe("pMapSettled — すべて成功するケース", () => {
  test("全件 fulfilled が返る", async () => {
    const result = await pMapSettled([1, 2, 3], async (n) => n * 2, 2);
    expect(result).toEqual([
      { status: "fulfilled", value: 2 },
      { status: "fulfilled", value: 4 },
      { status: "fulfilled", value: 6 },
    ]);
  });

  test("文字列の変換も正しく動作する", async () => {
    const result = await pMapSettled(["a", "b", "c"], async (s) => s.toUpperCase(), 3);
    expect(result).toEqual([
      { status: "fulfilled", value: "A" },
      { status: "fulfilled", value: "B" },
      { status: "fulfilled", value: "C" },
    ]);
  });

  test("入力順序を保ったまま結果が返る", async () => {
    // 遅い処理が先に来ても順序は保たれる
    const delays = [30, 10, 20];
    const result = await pMapSettled(
      delays,
      async (ms) => {
        await new Promise((r) => setTimeout(r, ms));
        return ms;
      },
      3,
    );
    expect(result).toEqual([
      { status: "fulfilled", value: 30 },
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
    ]);
  });
});

test.describe("pMapSettled — 一部が失敗するケース", () => {
  test("失敗した要素が rejected になり、成功した要素は fulfilled になる", async () => {
    const result = await pMapSettled(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error("failed at 2");
        return n * 10;
      },
      3,
    );
    expect(result[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(result[1]).toMatchObject({ status: "rejected" });
    expect((result[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect((result[1] as PromiseRejectedResult).reason.message).toBe("failed at 2");
    expect(result[2]).toEqual({ status: "fulfilled", value: 30 });
  });

  test("すべて失敗しても全件 rejected で返る（throw しない）", async () => {
    const result = await pMapSettled(
      ["x", "y"],
      async (s) => {
        throw new Error(`error: ${s}`);
      },
      2,
    );
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.status).toBe("rejected");
    }
  });

  test("reason に文字列エラーも収集できる", async () => {
    const result = await pMapSettled(
      [1],
      async () => {
        throw "string-error";
      },
      1,
    );
    expect(result[0]).toEqual({ status: "rejected", reason: "string-error" });
  });
});

test.describe("pMapSettled — 空配列", () => {
  test("空配列を渡すと空配列が返る", async () => {
    const result = await pMapSettled([], async (n: number) => n, 4);
    expect(result).toEqual([]);
  });
});

test.describe("pMapSettled — concurrency オプション", () => {
  test("concurrency=1 でも全件処理される", async () => {
    const result = await pMapSettled([1, 2, 3, 4, 5], async (n) => n * 2, 1);
    expect(result).toEqual([
      { status: "fulfilled", value: 2 },
      { status: "fulfilled", value: 4 },
      { status: "fulfilled", value: 6 },
      { status: "fulfilled", value: 8 },
      { status: "fulfilled", value: 10 },
    ]);
  });

  test("concurrency が 0 以下でも全件処理される", async () => {
    const result = await pMapSettled([1, 2, 3], async (n) => n * 2, 0);
    expect(result).toEqual([
      { status: "fulfilled", value: 2 },
      { status: "fulfilled", value: 4 },
      { status: "fulfilled", value: 6 },
    ]);
  });

  test("concurrency で同時実行数が制限される", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 6 }, (_, i) => i);
    await pMapSettled(
      items,
      async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent--;
      },
      2,
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  test("concurrency がアイテム数を超えても全件処理される", async () => {
    const result = await pMapSettled([10, 20], async (n) => n + 1, 100);
    expect(result).toEqual([
      { status: "fulfilled", value: 11 },
      { status: "fulfilled", value: 21 },
    ]);
  });

  test("concurrency=1 では直列に実行される", async () => {
    const order: number[] = [];
    await pMapSettled(
      [1, 2, 3],
      async (n) => {
        order.push(n);
        await new Promise((r) => setTimeout(r, 10));
      },
      1,
    );
    expect(order).toEqual([1, 2, 3]);
  });
});

// ==========================================================================
// pMap
// ==========================================================================

test.describe("pMap — すべて成功するケース", () => {
  test("全件の結果が配列で返る", async () => {
    const result = await pMap([1, 2, 3], async (n) => n * 3, 2);
    expect(result).toEqual([3, 6, 9]);
  });

  test("入力順序が保たれる", async () => {
    const delays = [30, 10, 20];
    const result = await pMap(
      delays,
      async (ms) => {
        await new Promise((r) => setTimeout(r, ms));
        return ms;
      },
      3,
    );
    expect(result).toEqual([30, 10, 20]);
  });
});

test.describe("pMap — 空配列", () => {
  test("空配列を渡すと空配列が返る", async () => {
    const result = await pMap([], async (n: number) => n, 4);
    expect(result).toEqual([]);
  });
});

test.describe("pMap — 失敗時の挙動", () => {
  test("fn が throw すると pMap も throw する", async () => {
    await expect(
      pMap(
        [1, 2, 3],
        async (n) => {
          if (n === 2) throw new Error("pMap error");
          return n;
        },
        3,
      ),
    ).rejects.toThrow("pMap error");
  });
});

test.describe("pMap — concurrency オプション", () => {
  test("concurrency で同時実行数が制限される", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 6 }, (_, i) => i);
    await pMap(
      items,
      async (n) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent--;
        return n;
      },
      3,
    );

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  test("concurrency=1 では直列実行になる", async () => {
    const order: number[] = [];
    await pMap(
      [1, 2, 3],
      async (n) => {
        order.push(n);
        await new Promise((r) => setTimeout(r, 10));
        return n;
      },
      1,
    );
    expect(order).toEqual([1, 2, 3]);
  });

  test("concurrency が負数でも全件処理される", async () => {
    const result = await pMap([1, 2, 3], async (n) => n + 1, -2);
    expect(result).toEqual([2, 3, 4]);
  });
});
