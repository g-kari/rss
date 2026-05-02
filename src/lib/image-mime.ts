/**
 * 画像 MIME タイプ検証ユーティリティ。
 *
 * XSS リスクのある SVG・HTML などを排除するため、ホワイトリスト方式を採用する。
 * マジックバイト検証で Content-Type ヘッダーの偽装にも対応する。
 */

/** 許可する画像 MIME タイプ → ファイル拡張子のマッピング。SVG は XSS リスクのため除外。 */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** 許可する画像 MIME タイプのホワイトリスト（detectImageMimeType と整合）。 */
export const ALLOWED_IMAGE_CONTENT_TYPES = new Set(Object.keys(MIME_TO_EXT));

/** MIME タイプからファイル拡張子を返す。不明な場合は "jpg" を返す。 */
export function mimeToExt(mime: string): string {
  return MIME_TO_EXT[mime] ?? "jpg";
}

/**
 * 先頭バイトから画像フォーマットを検出する（マジックバイト検証）。
 * Content-Type が application/octet-stream の場合のフォールバックとして使用。
 * 検出できない場合は null を返す。
 */
export function detectImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";

  // GIF: 47 49 46 38 (GIF87a / GIF89a)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38)
    return "image/gif";

  // WebP: RIFF????WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";

  // AVIF / HEIF: ftyp box (offset 4-7 = "ftyp", brand の先頭 4 bytes で判別)
  // HEIC/HEIF は主要ブラウザ未対応のため null を返して拒否する
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "image/avif"; // avis = Sequence AVIF
    if (brand === "heic" || brand === "heix") return null; // HEIC はブラウザ未対応のため拒否
  }

  return null;
}
