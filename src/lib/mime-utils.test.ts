/**
 * mime-utils.parseFtypBrand spec (cycle 66 simplify audit Issue 2 / 92% 信頼度)
 *
 * image-mime.ts / video-mime.ts 双方の ftyp box parser を統合した純粋関数。
 * extracted byte-for-byte identical な ISO BMFF brand 抽出ロジック。
 */
import { describe, it, expect } from "vitest";
import { parseFtypBrand } from "./mime-utils";

function bytes(...nums: number[]): Uint8Array {
  return new Uint8Array(nums);
}

describe("parseFtypBrand (cycle 66 simplify Issue 2)", () => {
  it("ftyp box の brand を抽出する (avif)", () => {
    // box size (4 bytes) + "ftyp" + "avif"
    const b = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66);
    expect(parseFtypBrand(b)).toBe("avif");
  });

  it("brand mp42 を抽出する", () => {
    const b = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32);
    expect(parseFtypBrand(b)).toBe("mp42");
  });

  it("brand qt   (quicktime, trailing spaces) を抽出する", () => {
    // "qt  " (0x71 0x74 0x20 0x20)
    const b = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20);
    expect(parseFtypBrand(b)).toBe("qt  ");
  });

  it("12 bytes 未満なら null", () => {
    const b = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69);
    expect(parseFtypBrand(b)).toBeNull();
  });

  it("ftyp 文字列でない (offset 4-7 が異なる) なら null", () => {
    // PNG header (89 50 4E 47 …)
    const b = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
    expect(parseFtypBrand(b)).toBeNull();
  });

  it("空配列なら null", () => {
    expect(parseFtypBrand(new Uint8Array(0))).toBeNull();
  });
});
