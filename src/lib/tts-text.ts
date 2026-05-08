/**
 * TTS（Web Speech API）で読み上げるテキストを事前整形する純粋関数。
 *
 * URL をそのまま読み上げると音声合成エンジンがアルファベット 1 文字
 * ずつ読み上げてしまい、聴感が著しく悪化する（#655）。記事本文中の
 * URL は記事タイトル・本文への補足情報であって読み上げ対象として
 * 重要ではないことが多いため、短い日本語トークン「リンク」に置換する。
 *
 * 文字クラスは RFC 3986 の URL safe 文字（ASCII のみ）。`(`, `)`, `,` は
 * 通常の文章で URL を囲んだり区切ったりするために使われやすいので
 * 文字クラスから除外し、URL の終端として機能させる。
 */
const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'*+;=%]+/g;
const TRAILING_PUNCT_PATTERN = /[.,;:!?)\]]+$/;

export function preprocessTtsText(text: string): string {
  if (!text) return text;
  return text.replace(URL_PATTERN, (match) => {
    const trailing = TRAILING_PUNCT_PATTERN.exec(match);
    return "リンク" + (trailing ? trailing[0] : "");
  });
}
