import { test, expect } from "@playwright/test";
import {
  GALLERY_AUTO_SCROLL_SPEEDS,
  SLIDESHOW_INTERVAL_MS,
  SLIDESHOW_JUMP_RATIO,
  computeContinuousScrollDelta,
  computeSlideshowJump,
  isAutoScrollEnabled,
  isContinuousScrollMode,
  isSlideshowMode,
  parseGalleryAutoScrollSpeed,
} from "../src/lib/gallery-autoscroll";

test.describe("GALLERY_AUTO_SCROLL_SPEEDS 列挙", () => {
  test("5 段階 (off / slow / medium / fast / slideshow) を含む", () => {
    expect(GALLERY_AUTO_SCROLL_SPEEDS).toEqual(["off", "slow", "medium", "fast", "slideshow"]);
  });

  test("SLIDESHOW_INTERVAL_MS は 3 秒", () => {
    expect(SLIDESHOW_INTERVAL_MS).toBe(3000);
  });

  test("SLIDESHOW_JUMP_RATIO は 0.85 (見切れ防止)", () => {
    expect(SLIDESHOW_JUMP_RATIO).toBe(0.85);
  });
});

test.describe("computeContinuousScrollDelta", () => {
  test("slow で 1 秒経過 → 30px", () => {
    expect(computeContinuousScrollDelta("slow", 1000)).toBe(30);
  });

  test("medium で 1 秒経過 → 60px", () => {
    expect(computeContinuousScrollDelta("medium", 1000)).toBe(60);
  });

  test("fast で 100ms 経過 → 12px (120 * 0.1)", () => {
    expect(computeContinuousScrollDelta("fast", 100)).toBeCloseTo(12, 5);
  });

  test("off は常に 0", () => {
    expect(computeContinuousScrollDelta("off", 1000)).toBe(0);
    expect(computeContinuousScrollDelta("off", 100)).toBe(0);
  });

  test("slideshow は連続スクロール非該当なので 0", () => {
    expect(computeContinuousScrollDelta("slideshow", 1000)).toBe(0);
  });

  test("経過時間 0 以下は 0", () => {
    expect(computeContinuousScrollDelta("fast", 0)).toBe(0);
    expect(computeContinuousScrollDelta("fast", -100)).toBe(0);
  });

  test("slow で 16ms (1 frame 相当) → ~0.48px", () => {
    expect(computeContinuousScrollDelta("slow", 16)).toBeCloseTo(0.48, 2);
  });
});

test.describe("isContinuousScrollMode", () => {
  test("slow / medium / fast は true", () => {
    expect(isContinuousScrollMode("slow")).toBe(true);
    expect(isContinuousScrollMode("medium")).toBe(true);
    expect(isContinuousScrollMode("fast")).toBe(true);
  });

  test("off / slideshow は false", () => {
    expect(isContinuousScrollMode("off")).toBe(false);
    expect(isContinuousScrollMode("slideshow")).toBe(false);
  });
});

test.describe("isSlideshowMode", () => {
  test("slideshow のみ true", () => {
    expect(isSlideshowMode("slideshow")).toBe(true);
  });

  test("他は全て false", () => {
    expect(isSlideshowMode("off")).toBe(false);
    expect(isSlideshowMode("slow")).toBe(false);
    expect(isSlideshowMode("medium")).toBe(false);
    expect(isSlideshowMode("fast")).toBe(false);
  });
});

test.describe("isAutoScrollEnabled", () => {
  test("off 以外は全て true", () => {
    expect(isAutoScrollEnabled("slow")).toBe(true);
    expect(isAutoScrollEnabled("medium")).toBe(true);
    expect(isAutoScrollEnabled("fast")).toBe(true);
    expect(isAutoScrollEnabled("slideshow")).toBe(true);
  });

  test("off は false", () => {
    expect(isAutoScrollEnabled("off")).toBe(false);
  });
});

test.describe("computeSlideshowJump", () => {
  test("viewport 1000px → 850px (0.85 倍)", () => {
    expect(computeSlideshowJump(1000)).toBe(850);
  });

  test("viewport 800px → 680px", () => {
    expect(computeSlideshowJump(800)).toBe(680);
  });

  test("viewport 0 / 負数 → 0", () => {
    expect(computeSlideshowJump(0)).toBe(0);
    expect(computeSlideshowJump(-100)).toBe(0);
  });
});

test.describe("parseGalleryAutoScrollSpeed", () => {
  test("有効値はそのまま返す", () => {
    expect(parseGalleryAutoScrollSpeed("off")).toBe("off");
    expect(parseGalleryAutoScrollSpeed("slow")).toBe("slow");
    expect(parseGalleryAutoScrollSpeed("medium")).toBe("medium");
    expect(parseGalleryAutoScrollSpeed("fast")).toBe("fast");
    expect(parseGalleryAutoScrollSpeed("slideshow")).toBe("slideshow");
  });

  test("不正値は off にフォールバック", () => {
    expect(parseGalleryAutoScrollSpeed("turbo")).toBe("off");
    expect(parseGalleryAutoScrollSpeed("FAST")).toBe("off");
    expect(parseGalleryAutoScrollSpeed("")).toBe("off");
  });

  test("null / undefined は off", () => {
    expect(parseGalleryAutoScrollSpeed(null)).toBe("off");
    expect(parseGalleryAutoScrollSpeed(undefined)).toBe("off");
  });
});
