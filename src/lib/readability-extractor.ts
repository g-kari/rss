import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom/worker";
import { replaceUntilStable } from "./html-post-processor";
import type { LDDocument } from "./linkedom-types";

/**
 * Readability 退避用プレースホルダークラス名。
 * Readability の classesToPreserve オプションで保持され、placeholder <p> タグを識別するのに使う。
 */
const EMBED_PLACEHOLDER_CLASS = "rss-reader-preserved-embed";

/**
 * iframe / video / audio タグを Readability 実行前に `<p>` プレースホルダーに退避する。
 *
 * Readability は独自の VIDEO_REGEXP (youtube/vimeo/dailymotion/twitch の一部等) に合致しない
 * iframe を本文外と判定して削除する。signing.jp の embed.nicovideo.jp や Spotify /
 * SoundCloud 埋込みは VIDEO_REGEXP に含まれず削除されてしまう。
 *
 * 対策として、信頼済み埋込みタグを文字列として退避し、Readability にはダミーの <p> を渡す。
 * 復元時に元のタグに戻す。<p> を使うのは Readability が本文候補として扱って残しやすいため。
 */
function preserveTrustedEmbeds(html: string): { html: string; embeds: string[] } {
  const embeds: string[] = [];
  const placeholder = (match: string): string => {
    const idx = embeds.push(match) - 1;
    // インデックスをテキスト内容に埋め込む（preClean の data-* 除去対策）。
    // ダミーテキストは Readability が本文候補として保持しやすいよう十分な長さを持たせる。
    return `<p class="${EMBED_PLACEHOLDER_CLASS}">RSSREADER_EMBED_PLACEHOLDER_${idx}_END preserved embed placeholder. preserved embed placeholder.</p>`;
  };
  let result = html;
  result = result.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, placeholder);
  result = result.replace(/<iframe\b[^>]*\/?>/gi, placeholder);
  result = result.replace(/<video\b[^>]*>[\s\S]*?<\/video\s*>/gi, placeholder);
  result = result.replace(/<video\b[^>]*\/?>/gi, placeholder);
  result = result.replace(/<audio\b[^>]*>[\s\S]*?<\/audio\s*>/gi, placeholder);
  result = result.replace(/<audio\b[^>]*\/?>/gi, placeholder);
  return { html: result, embeds };
}

/**
 * preserveTrustedEmbeds で埋めたプレースホルダー <p> を元の iframe/video/audio に復元する。
 *
 * Readability 出力はタグ名が大文字化される (`<P>`) ことがあるため case-insensitive で照合する。
 * インデックスはテキスト内容の `RSSREADER_EMBED_PLACEHOLDER_N_END` から抽出する。
 * インデックスが範囲外なら空文字に置換（fail-safe）。
 */
function restoreTrustedEmbeds(html: string, embeds: string[]): string {
  return html.replace(
    /<p\b[^>]*class=["'][^"']*rss-reader-preserved-embed[^"']*["'][^>]*>([\s\S]*?)<\/p\s*>/gi,
    (_match, inner: string) => {
      const idxMatch = inner.match(/RSSREADER_EMBED_PLACEHOLDER_(\d+)_END/);
      if (!idxMatch) return "";
      const idx = Number(idxMatch[1]);
      return embeds[idx] ?? "";
    },
  );
}

/**
 * Readability 実行前の前処理。DOM パース精度を上げるためノイズを除去する。
 * - <picture> を単純化して <img> のみ残す
 * - <noscript> 内の画像を救出（遅延ロード対策）
 * - 不要な属性を除去（data-content / data-src は保持）
 * - <style> / <script> を除去
 */
function preClean(html: string): string {
  let h = html;
  h = h.replace(/<picture\b[^>]*>([\s\S]*?)<\/picture\b[^>]*>/gi, (_m, inner: string) => {
    const img = inner.match(/<img\b[^>]*>/i);
    return img ? img[0] : "";
  });
  h = h.replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript\b[^>]*>/gi, (_m, inner: string) =>
    /<img\b/i.test(inner) ? inner : "",
  );
  // 属性除去・<style>/<script> 除去は「除去後に残った文字列が再度同一パターンを形成する」
  // バイパスを防ぐため、不動点反復で適用する。閉じタグは HTML5 仕様どおり
  // `</tagname attr>` も受容するため `\b[^>]*>` でマッチさせる。
  h = replaceUntilStable(
    h,
    /\s+(?:data-(?!content\b|src\b)[a-z][a-z0-9-]*|aria-[a-z-]+|on[a-z]+)=["'][^"']*["']/gi,
  );
  h = replaceUntilStable(h, /<style\b[\s\S]*?<\/style\b[^>]*>/gi);
  h = replaceUntilStable(h, /<script\b[\s\S]*?<\/script\b[^>]*>/gi);
  return h;
}

/**
 * @mozilla/readability + linkedom/worker を使って記事本文を抽出する。
 * 失敗した場合は null を返す（fail-open 設計）。
 */
export function extractWithReadability(html: string, url: string): string | null {
  try {
    // Readability は独自の VIDEO_REGEXP に合致しない iframe（embed.nicovideo.jp 等）を
    // 本文外と判定して削除する。信頼済み iframe / video / audio をプレースホルダーに
    // 退避し、Readability 実行後に復元する。Issue #120 の回帰対策。
    const { html: preserved, embeds } = preserveTrustedEmbeds(html);
    const { document } = parseHTML(preClean(preserved)) as { document: LDDocument };
    try {
      const base = document.createElement("base");
      base.href = url;
      document.head.appendChild(base);
    } catch {
      /* ignore */
    }

    const article = new Readability(document as unknown as Document, {
      classesToPreserve: [EMBED_PLACEHOLDER_CLASS],
    }).parse();
    const content = article?.content ?? null;
    return content ? restoreTrustedEmbeds(content, embeds) : null;
  } catch (err) {
    console.error("[readability] extractWithReadability failed:", err);
    return null;
  }
}
