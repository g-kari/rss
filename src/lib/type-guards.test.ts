import { describe, expect, it } from "vitest";
import { isPlainObject } from "./type-guards";

describe("isPlainObject", () => {
  it("plain object は true", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("null は false (typeof null === 'object' の罠を排除)", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("undefined は false", () => {
    expect(isPlainObject(undefined)).toBe(false);
  });

  it("配列は false", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
  });

  it("primitive は false", () => {
    expect(isPlainObject("str")).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });

  it("class instance / Date も object として true (plain 判定は行わない)", () => {
    // JSON.parse 由来の値を narrow する用途なので prototype までは見ない仕様
    expect(isPlainObject(new Date())).toBe(true);
  });

  it("narrow 後は Record<string, unknown> として index access できる", () => {
    const v: unknown = { image: "x" };
    if (isPlainObject(v)) {
      expect(v.image).toBe("x");
    } else {
      throw new Error("should narrow");
    }
  });
});
