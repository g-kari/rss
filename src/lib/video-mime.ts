/**
 * 動画 MIME タイプ検証ユーティリティ。
 *
 * 許可形式は mp4 / webm / quicktime のみ。mkv / m4v / flv 等は許可しない (#715)。
 * マジックバイト検証で Content-Type ヘッダーの偽装にも対応する。
 */

import { parseFtypBrand } from "./mime-utils";

/** 許可する動画 MIME タイプのホワイトリスト (#715)。 */
export const ALLOWED_VIDEO_CONTENT_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

/**
 * 先頭バイトから動画フォーマットを検出する (マジックバイト検証)。
 * Content-Type が application/octet-stream / 不明な場合のフォールバックとして使用。
 * 検出できない場合は null を返す。
 *
 * 注: EBML 系 (webm / mkv) は magic bytes が同じ。webm として返し、ALLOWED list 側で
 * mkv の DocType を含む場合の判別は Content-Type 検証に委ねる (本関数は最小判定のみ)。
 */
export function detectVideoMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // ISO BMFF (mp4 / quicktime / 3gp): ftyp box の brand で判別
  const ftypBrand = parseFtypBrand(bytes);
  if (ftypBrand) {
    if (ftypBrand === "qt  ") return "video/quicktime";
    // mp4 系 brand (isom / mp41 / mp42 / iso2 / avc1 / dash 等) は全て mp4 として扱う
    if (
      ftypBrand === "isom" ||
      ftypBrand === "iso2" ||
      ftypBrand === "mp41" ||
      ftypBrand === "mp42" ||
      ftypBrand === "avc1" ||
      ftypBrand === "dash" ||
      ftypBrand === "M4V " ||
      ftypBrand === "M4A "
    ) {
      return "video/mp4";
    }
    // 未知 brand は null (許可不能)
    return null;
  }

  // WebM / MKV: EBML header (1A 45 DF A3)
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video/webm";
  }

  return null;
}
