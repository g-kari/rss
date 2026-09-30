// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createConcurrencyLimiter } from "./concurrency";

describe("createConcurrencyLimiter", () => {
  it("bounds active work, preserves FIFO admission, and releases after rejection", async () => {
    const limit = createConcurrencyLimiter(2);
    const releases: Array<() => void> = [];
    const started: number[] = [];
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 6 }, (_, i) =>
      limit(async () => {
        started.push(i);
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
        if (i === 0) throw new Error("parse failed");
        return i;
      }),
    );
    const settled = Promise.allSettled(jobs);
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (i === 0) expect(started).toEqual([0, 1]);
      releases[i]();
    }
    const results = await settled;
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(results[0].status).toBe("rejected");
    expect(results.slice(1).every((result) => result.status === "fulfilled")).toBe(true);
  });

  it("releases its slot after a synchronous throw", async () => {
    const limit = createConcurrencyLimiter(1);
    await expect(
      limit(() => {
        throw new Error("sync failure");
      }),
    ).rejects.toThrow("sync failure");
    expect(await limit(async () => "next")).toBe("next");
  });
});

describe("rotateBatchStart", () => {
  it("gives every item first position over a full cycle and preserves inputs", async () => {
    const { rotateBatchStart } = await import("./concurrency");
    for (const length of [0, 1, 2, 3, 10, 31, 50, 1000]) {
      const items = Array.from({ length }, (_, i) => i);
      const starts = new Set<number>();
      for (let cycle = 0; cycle < length; cycle++) {
        const rotated = rotateBatchStart(items, cycle);
        expect(rotated).toHaveLength(length);
        starts.add(rotated[0]);
      }
      expect(starts.size).toBe(length);
      expect(items).toEqual(Array.from({ length }, (_, i) => i));
    }
  });
});
