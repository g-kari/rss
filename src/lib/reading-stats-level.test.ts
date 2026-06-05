import { describe, it, expect } from "vitest";
import { countToLevel } from "./reading-stats-level";

describe("countToLevel", () => {
  it("count === 0 は 0", () => expect(countToLevel(0, 10)).toBe(0));
  it("max === 0 は 0 (0除算ガード)", () => expect(countToLevel(5, 0)).toBe(0));
  it("count === 0 かつ max === 0 は 0", () => expect(countToLevel(0, 0)).toBe(0));

  it("ratio 0.2 (<= 0.25) は 1", () => expect(countToLevel(2, 10)).toBe(1));
  it("ratio 境界 0.25 (<= 0.25) は 1", () => expect(countToLevel(25, 100)).toBe(1));

  it("ratio 0.4 (<= 0.5) は 2", () => expect(countToLevel(4, 10)).toBe(2));
  it("ratio 境界 0.5 (<= 0.5) は 2", () => expect(countToLevel(50, 100)).toBe(2));

  it("ratio 0.7 (<= 0.75) は 3", () => expect(countToLevel(7, 10)).toBe(3));
  it("ratio 境界 0.75 (<= 0.75) は 3", () => expect(countToLevel(75, 100)).toBe(3));

  it("ratio 0.8 (> 0.75) は 4", () => expect(countToLevel(8, 10)).toBe(4));
  it("ratio 1.0 (max と同値) は 4", () => expect(countToLevel(10, 10)).toBe(4));
  it("ratio > 1.0 (count > max) は 4", () => expect(countToLevel(15, 10)).toBe(4));
});
