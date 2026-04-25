import { test, expect } from "@playwright/test";
import { serialized } from "../src/lib/serialize-async";

test.describe("serialized — 同一キーの同時リクエスト直列化", () => {
  test("同一キーの並行呼び出しが直列化される", async () => {
    const order: string[] = [];

    const op1 = serialized("key-a", async () => {
      order.push("op1-start");
      await new Promise((r) => setTimeout(r, 50));
      order.push("op1-end");
      return 1;
    });

    const op2 = serialized("key-a", async () => {
      order.push("op2-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("op2-end");
      return 2;
    });

    const [r1, r2] = await Promise.all([op1, op2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(order).toEqual(["op1-start", "op1-end", "op2-start", "op2-end"]);
  });

  test("異なるキーの並行呼び出しは並列実行される", async () => {
    const order: string[] = [];

    const op1 = serialized("key-x", async () => {
      order.push("x-start");
      await new Promise((r) => setTimeout(r, 50));
      order.push("x-end");
      return "x";
    });

    const op2 = serialized("key-y", async () => {
      order.push("y-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("y-end");
      return "y";
    });

    const [r1, r2] = await Promise.all([op1, op2]);
    expect(r1).toBe("x");
    expect(r2).toBe("y");
    expect(order[0]).toBe("x-start");
    expect(order[1]).toBe("y-start");
    expect(order[2]).toBe("y-end");
    expect(order[3]).toBe("x-end");
  });

  test("前の操作が失敗しても次の操作は実行される", async () => {
    const op1 = serialized("key-err", async () => {
      throw new Error("op1 failed");
    });

    const op2 = serialized("key-err", async () => {
      return "op2 ok";
    });

    await expect(op1).rejects.toThrow("op1 failed");
    expect(await op2).toBe("op2 ok");
  });

  test("3つの同一キー操作が順序通りに直列化される", async () => {
    const order: number[] = [];

    const ops = [1, 2, 3].map((n) =>
      serialized("key-triple", async () => {
        order.push(n);
        await new Promise((r) => setTimeout(r, 10));
        return n;
      }),
    );

    const results = await Promise.all(ops);
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  test("read-modify-write の競合が防止される", async () => {
    let counter = 0;

    const increment = () =>
      serialized("counter-key", async () => {
        const current = counter;
        await new Promise((r) => setTimeout(r, 10));
        counter = current + 1;
        return counter;
      });

    await Promise.all([increment(), increment(), increment()]);
    expect(counter).toBe(3);
  });
});
