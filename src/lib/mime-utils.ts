/**
 * MIME 検出ユーティリティ。
 *
 * ISO BMFF (`ftyp` box) の brand 抽出を image-mime.ts / video-mime.ts で共有する。
 * AVIF / HEIF / mp4 / quicktime 等は全て `ftyp` box でフォーマットを宣言するため、
 * brand 文字列の抽出までを共通化し、brand → MIME のマッピングは consumer 側に委ねる。
 */

/**
 * 先頭バイトが ISO BMFF (`ftyp` box) であるかを判定し、brand (4 文字) を返す。
 * ftyp box でない、もしくはバイト数不足の場合は null。
 *
 * brand の例: "avif" / "avis" / "heic" / "heix" / "isom" / "iso2" / "mp41" / "mp42" /
 * "avc1" / "dash" / "M4V " / "M4A " / "qt  " 等
 */
export function parseFtypBrand(bytes: Uint8Array): string | null {
  if (
    bytes.length < 12 ||
    bytes[4] !== 0x66 ||
    bytes[5] !== 0x74 ||
    bytes[6] !== 0x79 ||
    bytes[7] !== 0x70
  ) {
    return null;
  }
  return String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
}
