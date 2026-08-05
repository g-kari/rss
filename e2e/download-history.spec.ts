import { test, expect } from "@playwright/test";
import {
  addUrlToHistory,
  countUrlsInHistory,
  MAX_DOWNLOAD_HISTORY,
} from "../src/lib/download-history";

/**
 * 画像ダウンロード履歴管理の単体テスト (#648)。
 *
 * `localStorage` ベースの DL 済み URL リストを FIFO で管理する純粋関数。
 */

test.describe("addUrlToHistory", () => {
  test("空の履歴に URL を追加すると 1 件配列を返す", () => {
    const result = addUrlToHistory([], "https://example.com/a.jpg", MAX_DOWNLOAD_HISTORY);
    expect(result).toEqual(["https://example.com/a.jpg"]);
  });

  test("既存履歴の末尾に新規 URL を追加する", () => {
    const result = addUrlToHistory(
      ["https://example.com/a.jpg"],
      "https://example.com/b.jpg",
      MAX_DOWNLOAD_HISTORY,
    );
    expect(result).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"]);
  });

  test("既に存在する URL は重複追加しない（同一インスタンス返却）", () => {
    const original = ["https://example.com/a.jpg"];
    const result = addUrlToHistory(original, "https://example.com/a.jpg", MAX_DOWNLOAD_HISTORY);
    expect(result).toBe(original);
  });

  test("上限超過時は先頭の最古要素を削除して新規を末尾に追加（FIFO）", () => {
    const limit = 3;
    const history = ["a", "b", "c"];
    const result = addUrlToHistory(history, "d", limit);
    expect(result).toEqual(["b", "c", "d"]);
  });

  test("上限内なら全件保持される", () => {
    const limit = 5;
    const history = ["a", "b", "c"];
    const result = addUrlToHistory(history, "d", limit);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  test("upper bound: limit=1 で常に最新 1 件のみ保持", () => {
    let h: string[] = [];
    h = addUrlToHistory(h, "a", 1);
    h = addUrlToHistory(h, "b", 1);
    h = addUrlToHistory(h, "c", 1);
    expect(h).toEqual(["c"]);
  });

  test("空文字 URL は追加しない（同一インスタンス返却）", () => {
    const original = ["https://example.com/a.jpg"];
    const result = addUrlToHistory(original, "", MAX_DOWNLOAD_HISTORY);
    expect(result).toBe(original);
  });

  test("MAX_DOWNLOAD_HISTORY が 5000 で公開されている（保護対象）", () => {
    expect(MAX_DOWNLOAD_HISTORY).toBe(5000);
  });
});

test.describe("countUrlsInHistory", () => {
  test("履歴に存在する URL の件数を返す", () => {
    expect(countUrlsInHistory(["a", "b", "c"], ["b", "c", "d"])).toBe(2);
  });

  test("同じ画像 URL が複数あればそれぞれ 1 件として数える", () => {
    expect(countUrlsInHistory(["a", "a", "b"], ["a"])).toBe(2);
  });

  test("画像または履歴が空なら 0 件を返す", () => {
    expect(countUrlsInHistory([], ["a"])).toBe(0);
    expect(countUrlsInHistory(["a"], [])).toBe(0);
  });
});
