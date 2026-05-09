import { test, expect } from "@playwright/test";
import { selectGalleryImages } from "../src/lib/gallery-display";

/**
 * `selectGalleryImages` の単体テスト (#671)。
 *
 * 「本文画像が一枚もない場合はサムネ/OGP を表示」を純粋関数として表現したロジックの
 * 全分岐を網羅する。
 */

test.describe("selectGalleryImages — ソース優先順位", () => {
  test("prefetched に複数あればそれを採用 (source=prefetched)", () => {
    const result = selectGalleryImages(["a.jpg", "b.jpg"], "thumb.jpg");
    expect(result).toEqual({ images: ["a.jpg", "b.jpg"], source: "prefetched" });
  });

  test("prefetched に 1 件のみでも prefetched を採用", () => {
    const result = selectGalleryImages(["only.jpg"], "thumb.jpg");
    expect(result).toEqual({ images: ["only.jpg"], source: "prefetched" });
  });

  test("prefetched が空配列で thumb があれば thumb fallback (#671 主シナリオ)", () => {
    const result = selectGalleryImages([], "thumb.jpg");
    expect(result).toEqual({ images: ["thumb.jpg"], source: "thumb" });
  });

  test("prefetched が undefined (未取得) で thumb があれば thumb fallback", () => {
    const result = selectGalleryImages(undefined, "thumb.jpg");
    expect(result).toEqual({ images: ["thumb.jpg"], source: "thumb" });
  });

  test("prefetched が空配列で thumb もなければ source=none", () => {
    const result = selectGalleryImages([], undefined);
    expect(result).toEqual({ images: [], source: "none" });
  });

  test("prefetched が undefined で thumb もなければ source=none", () => {
    const result = selectGalleryImages(undefined, undefined);
    expect(result).toEqual({ images: [], source: "none" });
  });

  test("thumb=null は undefined と同様に扱う", () => {
    const result = selectGalleryImages([], null);
    expect(result).toEqual({ images: [], source: "none" });
  });

  test("thumb=空文字列は undefined と同様に扱う (truthy check)", () => {
    const result = selectGalleryImages([], "");
    expect(result).toEqual({ images: [], source: "none" });
  });

  test("prefetched に画像があれば thumb は無視される", () => {
    const result = selectGalleryImages(["body.jpg"], "thumb.jpg");
    expect(result.source).toBe("prefetched");
    expect(result.images).not.toContain("thumb.jpg");
  });
});
