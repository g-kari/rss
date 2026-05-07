import { test, expect } from "@playwright/test";
import { ALLOWED_IMAGE_CONTENT_TYPES, mimeToExt, detectImageMimeType } from "../src/lib/image-mime";

test.describe("ALLOWED_IMAGE_CONTENT_TYPES", () => {
  test("許可リストに image/jpeg が含まれる", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("image/jpeg")).toBe(true);
  });

  test("許可リストに image/png が含まれる", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("image/png")).toBe(true);
  });

  test("許可リストに image/gif が含まれる", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("image/gif")).toBe(true);
  });

  test("許可リストに image/webp が含まれる", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("image/webp")).toBe(true);
  });

  test("許可リストに image/avif が含まれる", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("image/avif")).toBe(true);
  });

  test("許可リストに image/bmp が含まれる", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("image/bmp")).toBe(true);
  });

  test("SVG は XSS リスクのため許可リストに含まれない", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("image/svg+xml")).toBe(false);
  });

  test("text/html は許可リストに含まれない", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("text/html")).toBe(false);
  });

  test("application/json は許可リストに含まれない", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("application/json")).toBe(false);
  });

  test("application/octet-stream は許可リストに含まれない", () => {
    expect(ALLOWED_IMAGE_CONTENT_TYPES.has("application/octet-stream")).toBe(false);
  });
});

test.describe("mimeToExt", () => {
  test("image/jpeg → jpg", () => {
    expect(mimeToExt("image/jpeg")).toBe("jpg");
  });

  test("image/png → png", () => {
    expect(mimeToExt("image/png")).toBe("png");
  });

  test("image/gif → gif", () => {
    expect(mimeToExt("image/gif")).toBe("gif");
  });

  test("image/webp → webp", () => {
    expect(mimeToExt("image/webp")).toBe("webp");
  });

  test("image/avif → avif", () => {
    expect(mimeToExt("image/avif")).toBe("avif");
  });

  test("image/bmp → bmp", () => {
    expect(mimeToExt("image/bmp")).toBe("bmp");
  });

  test("未知の MIME タイプは jpg を返す（デフォルト）", () => {
    expect(mimeToExt("image/tiff")).toBe("jpg");
    expect(mimeToExt("image/svg+xml")).toBe("jpg");
    expect(mimeToExt("application/octet-stream")).toBe("jpg");
    expect(mimeToExt("")).toBe("jpg");
  });
});

test.describe("detectImageMimeType — マジックバイト検証", () => {
  test("JPEG マジックバイト (FF D8 FF) を検出する", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMimeType(bytes)).toBe("image/jpeg");
  });

  test("PNG マジックバイト (89 50 4E 47) を検出する", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMimeType(bytes)).toBe("image/png");
  });

  test("GIF マジックバイト (47 49 46 38) を検出する", () => {
    // GIF89a
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageMimeType(bytes)).toBe("image/gif");
  });

  test("GIF87a マジックバイトも検出する", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    expect(detectImageMimeType(bytes)).toBe("image/gif");
  });

  test("WebP マジックバイト (RIFF????WEBP) を検出する", () => {
    const bytes = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // size (任意)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(detectImageMimeType(bytes)).toBe("image/webp");
  });

  test("BMP マジックバイト (42 4D) を検出する", () => {
    const bytes = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);
    expect(detectImageMimeType(bytes)).toBe("image/bmp");
  });

  test("AVIF フォーマットを検出する (brand=avif)", () => {
    // ftyp box: [size(4)] + "ftyp" + "avif"
    const bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x1c, // box size
      0x66,
      0x74,
      0x79,
      0x70, // "ftyp"
      0x61,
      0x76,
      0x69,
      0x66, // brand "avif"
    ]);
    expect(detectImageMimeType(bytes)).toBe("image/avif");
  });

  test("AVIF シーケンス (brand=avis) も検出する", () => {
    const bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x1c,
      0x66,
      0x74,
      0x79,
      0x70, // "ftyp"
      0x61,
      0x76,
      0x69,
      0x73, // brand "avis"
    ]);
    expect(detectImageMimeType(bytes)).toBe("image/avif");
  });

  test("HEIC (brand=heic) は null を返す（ブラウザ未対応のため拒否）", () => {
    const bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x1c,
      0x66,
      0x74,
      0x79,
      0x70, // "ftyp"
      0x68,
      0x65,
      0x69,
      0x63, // brand "heic"
    ]);
    expect(detectImageMimeType(bytes)).toBeNull();
  });

  test("HEIF (brand=heix) は null を返す", () => {
    const bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x1c,
      0x66,
      0x74,
      0x79,
      0x70, // "ftyp"
      0x68,
      0x65,
      0x69,
      0x78, // brand "heix"
    ]);
    expect(detectImageMimeType(bytes)).toBeNull();
  });

  test("4 バイト未満では null を返す", () => {
    expect(detectImageMimeType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageMimeType(new Uint8Array([]))).toBeNull();
  });

  test("未知のフォーマットは null を返す", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(detectImageMimeType(bytes)).toBeNull();
  });

  test("HTML の先頭バイトは null を返す（XSS 防止）", () => {
    // '<' = 0x3c
    const bytes = new Uint8Array([0x3c, 0x21, 0x44, 0x4f]); // <!DO...
    expect(detectImageMimeType(bytes)).toBeNull();
  });
});
