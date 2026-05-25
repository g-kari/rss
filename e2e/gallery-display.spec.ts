import { test, expect } from "@playwright/test";
import { selectGalleryImages, selectGalleryDisplayMode } from "../src/lib/gallery-display";

/**
 * `selectGalleryImages` / `selectGalleryDisplayMode` の単体テスト (#671 / #819)。
 *
 * - `selectGalleryImages`: 「本文画像が一枚もない場合はサムネ/OGP を表示」を純粋関数として
 *   表現したロジックの全分岐を網羅 (#671)
 * - `selectGalleryDisplayMode`: GalleryItem 三項 chain (4-5 段) を平坦化した 7 mode 分類
 *   の優先順位と全分岐を網羅 (#819)
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

test.describe("selectGalleryDisplayMode — 7 mode 分類 + 優先順位 (#819)", () => {
  // mode 7 種類の単独ケース (各 mode を canonical で発火させる)

  test("isFetchFailed + thumb あり → failed-with-thumb", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: true,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: false,
        imageSource: "none",
        thumb: "ogp.jpg",
      }),
    ).toBe("failed-with-thumb");
  });

  test("isFetchFailed + thumb なし → failed-no-thumb", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: true,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: false,
        imageSource: "none",
        thumb: undefined,
      }),
    ).toBe("failed-no-thumb");
  });

  test("isForcedHidden true → forced-hidden (最優先)", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: true,
        fallbackToThumb: false,
        fallbackToNoImage: false,
        imageSource: "prefetched",
        thumb: "ogp.jpg",
      }),
    ).toBe("forced-hidden");
  });

  test("fallbackToThumb true → fallback-thumb (#671 主シナリオ)", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: false,
        fallbackToThumb: true,
        fallbackToNoImage: false,
        imageSource: "prefetched",
        thumb: "ogp.jpg",
      }),
    ).toBe("fallback-thumb");
  });

  test("fallbackToNoImage true → fallback-no-image", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: true,
        imageSource: "prefetched",
        thumb: undefined,
      }),
    ).toBe("fallback-no-image");
  });

  test("imageSource=prefetched で fallback なし → gallery", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: false,
        imageSource: "prefetched",
        thumb: undefined,
      }),
    ).toBe("gallery");
  });

  test("imageSource=thumb で fallback なし → gallery", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: false,
        imageSource: "thumb",
        thumb: "thumb.jpg",
      }),
    ).toBe("gallery");
  });

  test("imageSource=none で fallback なし → none", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: false,
        imageSource: "none",
        thumb: undefined,
      }),
    ).toBe("none");
  });

  // 優先順位 edge case (複数 true で先方が勝つ確認)

  test("isForcedHidden + isFetchFailed 同時 true → forced-hidden が勝つ (元コード early return 順序)", () => {
    // 元コード: `if (isForcedHidden) return <div hidden />` が三項 chain の手前で early
    // return される。本関数では isForcedHidden を最優先で評価して同挙動を保存。
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: true,
        isForcedHidden: true,
        fallbackToThumb: false,
        fallbackToNoImage: false,
        imageSource: "none",
        thumb: "ogp.jpg",
      }),
    ).toBe("forced-hidden");
  });

  test("isFetchFailed + fallbackToThumb 同時 true → failed-with-thumb が勝つ (isFetchFailed 優先)", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: true,
        isForcedHidden: false,
        fallbackToThumb: true,
        fallbackToNoImage: false,
        imageSource: "prefetched",
        thumb: "ogp.jpg",
      }),
    ).toBe("failed-with-thumb");
  });

  test("isFetchFailed + fallbackToNoImage 同時 true + thumb なし → failed-no-thumb が勝つ", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: true,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: true,
        imageSource: "prefetched",
        thumb: undefined,
      }),
    ).toBe("failed-no-thumb");
  });

  test("fallbackToThumb + imageSource=prefetched 同時 true → fallback-thumb が勝つ (fallback 優先)", () => {
    // 元コード: fallbackToThumb branch が imageSource !== "none" branch より上に書かれている
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: false,
        fallbackToThumb: true,
        fallbackToNoImage: false,
        imageSource: "prefetched",
        thumb: "ogp.jpg",
      }),
    ).toBe("fallback-thumb");
  });

  test("fallbackToNoImage + imageSource=prefetched 同時 true → fallback-no-image が勝つ", () => {
    expect(
      selectGalleryDisplayMode({
        isFetchFailed: false,
        isForcedHidden: false,
        fallbackToThumb: false,
        fallbackToNoImage: true,
        imageSource: "prefetched",
        thumb: undefined,
      }),
    ).toBe("fallback-no-image");
  });
});
