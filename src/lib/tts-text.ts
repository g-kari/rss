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

import { toPlainText } from "./html";

const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'*+;=%]+/g;
const TRAILING_PUNCT_PATTERN = /[.,;:!?)\]]+$/;

export function preprocessTtsText(text: string): string {
  if (!text) return text;
  return text.replace(URL_PATTERN, (match) => {
    const trailing = TRAILING_PUNCT_PATTERN.exec(match);
    return "リンク" + (trailing ? trailing[0] : "");
  });
}

/**
 * TTS 読み上げ対象テキストを構築する純粋関数。
 *
 * ソース優先順位 (高→低):
 *   1. translatedText (autoTranslate 完了時の翻訳結果) — #653
 *   2. processedContent (フェッチ済み or RSS 本文)
 *   3. article.summary (RSS サマリ)
 *
 * タイトルは原文のまま先頭に付ける（翻訳対象は本文のみ）。
 *
 * 空文字 / null / undefined は fallback の起点として扱う。空文字の翻訳結果が
 * 渡された場合は processedContent に fallback する（空翻訳の保護）。
 */
export function buildTtsText(
  article: { title?: string; summary?: string },
  processedContent: string | null,
  translatedText?: string | null,
): string {
  const source =
    (translatedText && translatedText.trim() ? translatedText : null) ??
    processedContent ??
    article.summary ??
    "";
  const body = preprocessTtsText(toPlainText(source));
  return [article.title, body].filter(Boolean).join("\n\n");
}
