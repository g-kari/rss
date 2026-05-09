import { test, expect } from "@playwright/test";
import { computeScrollDirection, computeHeaderVisibility } from "../src/lib/scroll-direction";

test.describe("computeScrollDirection — スクロール方向判定", () => {
  test("scrollTop が増加 (10 → 50) → 'down'", () => {
    expect(computeScrollDirection(10, 50)).toBe("down");
  });

  test("scrollTop が減少 (50 → 10) → 'up'", () => {
    expect(computeScrollDirection(50, 10)).toBe("up");
  });

  test("変化なし (50 → 50) → 'same'", () => {
    expect(computeScrollDirection(50, 50)).toBe("same");
  });

  test("微小揺れ (50 → 52, threshold 4) → 'same'", () => {
    expect(computeScrollDirection(50, 52)).toBe("same");
  });

  test("微小揺れ閾値ちょうど (50 → 54, threshold 4) → 'down' (>= threshold)", () => {
    expect(computeScrollDirection(50, 54)).toBe("down");
  });

  test("カスタム threshold (50 → 60, threshold 20) → 'same'", () => {
    expect(computeScrollDirection(50, 60, 20)).toBe("same");
  });

  test("負の方向で微小揺れ (50 → 48, threshold 4) → 'same'", () => {
    expect(computeScrollDirection(50, 48)).toBe("same");
  });

  test("threshold 0 → どんな差も方向判定", () => {
    expect(computeScrollDirection(50, 51, 0)).toBe("down");
    expect(computeScrollDirection(50, 49, 0)).toBe("up");
    expect(computeScrollDirection(50, 50, 0)).toBe("same");
  });
});

test.describe("computeHeaderVisibility — ヘッダー表示可否判定", () => {
  test("上端付近 (scrollTop < 80) は方向問わず常に表示", () => {
    expect(computeHeaderVisibility({ prevVisible: false, direction: "down", scrollTop: 10 })).toBe(
      true,
    );
    expect(computeHeaderVisibility({ prevVisible: true, direction: "down", scrollTop: 79 })).toBe(
      true,
    );
  });

  test("scrollTop=80 ちょうど (topThreshold=80) → 上端ガード適用外", () => {
    expect(computeHeaderVisibility({ prevVisible: true, direction: "down", scrollTop: 80 })).toBe(
      false,
    );
  });

  test("下スクロール → 隠す (scrollTop が threshold 超え)", () => {
    expect(computeHeaderVisibility({ prevVisible: true, direction: "down", scrollTop: 500 })).toBe(
      false,
    );
  });

  test("上スクロール → 表示", () => {
    expect(computeHeaderVisibility({ prevVisible: false, direction: "up", scrollTop: 500 })).toBe(
      true,
    );
  });

  test("微小揺れ ('same') → 前の状態維持 (prevVisible=true)", () => {
    expect(computeHeaderVisibility({ prevVisible: true, direction: "same", scrollTop: 500 })).toBe(
      true,
    );
  });

  test("微小揺れ ('same') → 前の状態維持 (prevVisible=false)", () => {
    expect(computeHeaderVisibility({ prevVisible: false, direction: "same", scrollTop: 500 })).toBe(
      false,
    );
  });

  test("カスタム topThreshold", () => {
    // topThreshold=200 → scrollTop=150 は上端扱いで表示
    expect(
      computeHeaderVisibility({
        prevVisible: false,
        direction: "down",
        scrollTop: 150,
        topThreshold: 200,
      }),
    ).toBe(true);
  });

  test("scrollTop=0 で down (端点) → 上端ガードで表示維持", () => {
    expect(computeHeaderVisibility({ prevVisible: true, direction: "down", scrollTop: 0 })).toBe(
      true,
    );
  });
});
