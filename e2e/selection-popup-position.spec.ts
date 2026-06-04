import { test, expect } from "@playwright/test";
import { computeSelectionPopupLayout } from "../src/lib/selection-popup-position";

/**
 * #1089: テキスト選択ポップアップの viewport-aware ポジショニング純粋関数 spec。
 * 選択が viewport 端にあっても popup が領域外にはみ出さないことを固定する。
 */
const VW = 1000;
const VH = 800;
const W = 200; // popup width
const H = 80; // popup height

test.describe("computeSelectionPopupLayout", () => {
  test("中央付近の選択は上 (above) に中央配置", () => {
    const r = computeSelectionPopupLayout({
      anchorX: 500,
      selectionTop: 400,
      selectionBottom: 420,
      popupWidth: W,
      popupHeight: H,
      viewportWidth: VW,
      viewportHeight: VH,
    });
    expect(r.placement).toBe("above");
    expect(r.left).toBe(500 - W / 2); // 400
    expect(r.top).toBe(400 - H - 8); // 312
  });

  test("左端の選択は left が margin にクランプ (領域外防止)", () => {
    const r = computeSelectionPopupLayout({
      anchorX: 10, // 選択中央が左端近く
      selectionTop: 400,
      selectionBottom: 420,
      popupWidth: W,
      popupHeight: H,
      viewportWidth: VW,
      viewportHeight: VH,
    });
    // 中央配置だと left = 10 - 100 = -90 で領域外 → margin 8 にクランプ
    expect(r.left).toBe(8);
  });

  test("右端の選択は right が viewport 内にクランプ", () => {
    const r = computeSelectionPopupLayout({
      anchorX: 995,
      selectionTop: 400,
      selectionBottom: 420,
      popupWidth: W,
      popupHeight: H,
      viewportWidth: VW,
      viewportHeight: VH,
    });
    // 中央配置だと left = 995 - 100 = 895、right = 1095 で領域外 → maxLeft = 1000-200-8 = 792
    expect(r.left).toBe(792);
    expect(r.left + W).toBeLessThanOrEqual(VW);
  });

  test("上端の選択は下 (below) にフリップ", () => {
    const r = computeSelectionPopupLayout({
      anchorX: 500,
      selectionTop: 10, // 上に余白なし
      selectionBottom: 30,
      popupWidth: W,
      popupHeight: H,
      viewportWidth: VW,
      viewportHeight: VH,
    });
    // above だと top = 10 - 80 - 8 = -78 < margin → below にフリップ
    expect(r.placement).toBe("below");
    expect(r.top).toBe(30 + 8); // 38
  });

  test("popup が viewport より広い場合は margin に固定 (NaN/負値防止)", () => {
    const r = computeSelectionPopupLayout({
      anchorX: 100,
      selectionTop: 400,
      selectionBottom: 420,
      popupWidth: 1200, // viewport(1000) より広い
      popupHeight: H,
      viewportWidth: VW,
      viewportHeight: VH,
    });
    expect(r.left).toBe(8);
  });

  test("上下どちらも収まらない背の高い popup は above を viewport 内クランプ", () => {
    const r = computeSelectionPopupLayout({
      anchorX: 500,
      selectionTop: 400,
      selectionBottom: 420,
      popupWidth: W,
      popupHeight: 790, // viewport(800) ほぼ全高
      viewportWidth: VW,
      viewportHeight: VH,
    });
    expect(r.placement).toBe("above");
    expect(r.top).toBeGreaterThanOrEqual(8);
    expect(r.top + 790).toBeLessThanOrEqual(VH + 8); // ほぼ viewport 内
  });

  test("gap / margin をカスタム指定できる", () => {
    const r = computeSelectionPopupLayout({
      anchorX: 500,
      selectionTop: 400,
      selectionBottom: 420,
      popupWidth: W,
      popupHeight: H,
      viewportWidth: VW,
      viewportHeight: VH,
      gap: 16,
      margin: 20,
    });
    expect(r.top).toBe(400 - H - 16); // 304
  });
});
