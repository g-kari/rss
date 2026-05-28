/**
 * computeContextMenuPosition 純粋関数 spec
 *
 * 3 箇所 (ArticleContextMenu / GalleryContextMenu / FeedItemComponent) に重複していた
 * viewport-aware popup positioning IIFE を helper に集約。仕様:
 *
 * - 左端は `Math.min(x, viewport.w - minWidth - 4)` で右端マージン 4px を確保
 * - 左端の下限は `Math.max(4, left)` で左端マージン 4px を確保
 * - 下スペース (`viewport.h - y`) が estimatedHeight 以上なら top アンカー
 * - 不足なら bottom アンカー (`viewport.h - y` を下端からのオフセットに)
 */
import { describe, it, expect } from "vitest";
import { computeContextMenuPosition } from "./context-menu-position";

describe("computeContextMenuPosition", () => {
  const VW = 1024;
  const VH = 768;

  it("下スペース十分: top アンカー (left は x のまま)", () => {
    const style = computeContextMenuPosition(100, 100, 180, 144, VW, VH);
    expect(style).toEqual({ top: 100, left: 100 });
  });

  it("下スペース不足: bottom アンカー (viewport.h - y)", () => {
    // y=700, estimatedHeight=144 -> spaceBelow=68 < 144 → bottom
    const style = computeContextMenuPosition(100, 700, 180, 144, VW, VH);
    expect(style).toEqual({ bottom: VH - 700, left: 100 });
  });

  it("右端近傍クリック: left をクランプして右端マージン 4px を確保", () => {
    // x=1000, viewport.w=1024, minWidth=180 → left = min(1000, 1024-180-4) = 840
    const style = computeContextMenuPosition(1000, 100, 180, 144, VW, VH);
    expect(style).toEqual({ top: 100, left: 840 });
  });

  it("左端近傍クリック: left の下限 4px を確保", () => {
    // x=0 → min(0, 840) = 0 → max(4, 0) = 4
    const style = computeContextMenuPosition(0, 100, 180, 144, VW, VH);
    expect(style).toEqual({ top: 100, left: 4 });
  });

  it("下スペース ちょうど estimatedHeight: top アンカー (>= 判定)", () => {
    // spaceBelow = VH - y = 144 → 144 >= 144 で top
    const style = computeContextMenuPosition(100, VH - 144, 180, 144, VW, VH);
    expect(style).toEqual({ top: VH - 144, left: 100 });
  });

  it("複数 menu 寸法対応: GalleryContextMenu (MIN_W=160, EST_H=170)", () => {
    const style = computeContextMenuPosition(100, 100, 160, 170, VW, VH);
    expect(style).toEqual({ top: 100, left: 100 });
  });

  it("複数 menu 寸法対応: FeedItemComponent visibleActions ベース (EST_H=actions*34)", () => {
    // 5 actions = 170, y=650, spaceBelow=118 < 170 → bottom
    const style = computeContextMenuPosition(100, 650, 180, 170, VW, VH);
    expect(style).toEqual({ bottom: VH - 650, left: 100 });
  });

  it("viewport が指定されないときは window から取得 (jsdom/happy-dom)", () => {
    // happy-dom default viewport は 1024x768
    const style = computeContextMenuPosition(100, 100, 180, 144);
    expect(style).toEqual({ top: 100, left: 100 });
  });
});
