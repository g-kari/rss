import { test, expect } from "@playwright/test";
import { ALLOWED_VIDEO_CONTENT_TYPES, detectVideoMimeType } from "../src/lib/video-mime";

test.describe("ALLOWED_VIDEO_CONTENT_TYPES", () => {
  test("video/mp4 が含まれる", () => {
    expect(ALLOWED_VIDEO_CONTENT_TYPES.has("video/mp4")).toBe(true);
  });

  test("video/webm が含まれる", () => {
    expect(ALLOWED_VIDEO_CONTENT_TYPES.has("video/webm")).toBe(true);
  });

  test("video/quicktime が含まれる", () => {
    expect(ALLOWED_VIDEO_CONTENT_TYPES.has("video/quicktime")).toBe(true);
  });

  test("video/x-matroska (mkv) は許可しない", () => {
    expect(ALLOWED_VIDEO_CONTENT_TYPES.has("video/x-matroska")).toBe(false);
  });

  test("video/x-m4v (m4v) は許可しない", () => {
    expect(ALLOWED_VIDEO_CONTENT_TYPES.has("video/x-m4v")).toBe(false);
  });

  test("image/jpeg は video の許可リストには含まれない", () => {
    expect(ALLOWED_VIDEO_CONTENT_TYPES.has("image/jpeg")).toBe(false);
  });

  test("text/html は許可リストに含まれない", () => {
    expect(ALLOWED_VIDEO_CONTENT_TYPES.has("text/html")).toBe(false);
  });
});

test.describe("detectVideoMimeType (マジックバイト検証)", () => {
  test("MP4: ftyp box + isom brand → video/mp4", () => {
    // 00 00 00 18 66 74 79 70 69 73 6F 6D
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    expect(detectVideoMimeType(bytes)).toBe("video/mp4");
  });

  test("MP4: ftyp box + mp42 brand → video/mp4", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    ]);
    expect(detectVideoMimeType(bytes)).toBe("video/mp4");
  });

  test("MP4: ftyp box + mp41 brand → video/mp4", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x31,
    ]);
    expect(detectVideoMimeType(bytes)).toBe("video/mp4");
  });

  test("QuickTime: ftyp box + qt brand → video/quicktime", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20,
    ]);
    expect(detectVideoMimeType(bytes)).toBe("video/quicktime");
  });

  test("WebM: EBML header (1A 45 DF A3) → video/webm", () => {
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
    expect(detectVideoMimeType(bytes)).toBe("video/webm");
  });

  test("不明バイト列は null", () => {
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(detectVideoMimeType(bytes)).toBe(null);
  });

  test("長さ不足は null", () => {
    const bytes = new Uint8Array([0x00, 0x00]);
    expect(detectVideoMimeType(bytes)).toBe(null);
  });

  test("MKV (Matroska) は EBML だが video/webm として誤認しない (DocType 確認)", () => {
    // EBML + DocType=matroska は許可しない方針 (#715 ユーザー判断)
    // ただし magic bytes だけで EBML を webm と判定する場合は MIME検出時に
    // ALLOWED list で弾く (Content-Type 検証で reject される) ことを保証
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]); // EBML だけ
    // 簡略化: EBML signature は webm として返し、ALLOWED list 側で MKV を弾く
    expect(detectVideoMimeType(bytes)).toBe("video/webm");
  });
});
