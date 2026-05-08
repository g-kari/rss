import { test, expect } from "@playwright/test";
import { whichSideClicked } from "../src/lib/inline-nav";

test.describe("whichSideClicked", () => {
  test("中央より左なら left", () => {
    expect(whichSideClicked(50, { left: 0, right: 200 })).toBe("left");
  });

  test("中央より右なら right", () => {
    expect(whichSideClicked(150, { left: 0, right: 200 })).toBe("right");
  });

  test("ちょうど中央なら right（境界は右側に倒す）", () => {
    expect(whichSideClicked(100, { left: 0, right: 200 })).toBe("right");
  });

  test("rect が画面オフセット位置でも相対判定が動く", () => {
    expect(whichSideClicked(550, { left: 500, right: 700 })).toBe("left");
    expect(whichSideClicked(650, { left: 500, right: 700 })).toBe("right");
  });

  test("rect の幅が 0 なら境界判定なし（right を返す）", () => {
    expect(whichSideClicked(100, { left: 100, right: 100 })).toBe("right");
  });
});
