/**
 * HTML 後処理パイプライン
 *
 * コンテンツ抽出後の後処理パイプライン本体。
 * 個別の処理は関心事ごとに分割された以下のモジュールに委譲する:
 * - html-noise-removal.ts  — ノイズ除去（removeNoise 等）
 * - html-image-processors.ts — 画像処理（fixLazyImages / fixImageDimensions 等）
 * - html-embed-transforms.ts — 埋め込み変換（Zenn / X / SpeakerDeck 等）
 *
 * 既存の import パスを壊さないよう、全 export をこのファイルから re-export する。
 */
import { sanitizeHtml } from "./html";
import { processNestedBlocks } from "./html-noise-removal";
import { tryParseBase, fixImageDimensions, rewriteImageUrls } from "./html-image-processors";
import { transformZennLinkEmbeds, transformZennMermaidEmbeds } from "./html-embed-transforms";
import { removeNoise } from "./html-noise-removal";
import { fixLazyImages, removeSmallThumbnailImages } from "./html-image-processors";

// ── re-export: html-noise-removal.ts ────────────────────────────
// removeDivsByClass / replaceBlocksByClass は html-noise-removal.ts の
// 内部利用 (removeNoise) でしか呼ばれず、外部 production caller も spec も
// ないため re-export しない (module-private 相当)。
export { replaceUntilStable, processNestedBlocks, removeNoise } from "./html-noise-removal";

// ── re-export: html-image-processors.ts ─────────────────────────
export {
  tryParseBase,
  fixLazyImages,
  fixImageDimensions,
  rewriteImageUrls,
  removeSmallThumbnailImages,
} from "./html-image-processors";

// ── re-export: html-embed-transforms.ts ─────────────────────────
// extractZennEmbedContent は html-embed-transforms.ts 内部利用のみで
// 外部 caller がないため re-export しない。
export {
  transformZennLinkEmbeds,
  transformZennMermaidEmbeds,
  transformXTweetEmbeds,
  transformSpeakerDeckScriptEmbeds,
  transformSlideShareEmbedLinks,
} from "./html-embed-transforms";

/**
 * table タグをレスポンシブスクロール可能なラッパーで包む。
 * ネストした table にも対応するため processNestedBlocks を使用する。
 */
export function wrapTables(html: string): string {
  return processNestedBlocks(
    html,
    ["table"],
    null,
    (openTag, inner) =>
      `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1.25em 0">${openTag}${inner}</table></div>`,
  );
}

/**
 * <a> タグに target="_blank" と rel="noopener noreferrer" を付与し、
 * 相対 href を pageUrl ベースで絶対 URL に変換する。
 * 記事内リンクを新しいタブで開くことで読書を中断せずリンクを確認できる。
 * フラグメントのみのリンク (#anchor) は同一ページ内アンカーのためそのまま保持する。
 * 危険スキーム (javascript: / data: 等) は後続の sanitizeHtml で除去されるためここでは無視する。
 */
export function fixExternalLinks(html: string, pageUrl = ""): string {
  const base = tryParseBase(pageUrl);

  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    // href 属性の値を取得
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']*?)["']/i);
    const href = hrefMatch?.[1] ?? "";

    // href なし・フラグメントのみ (#anchor) はそのまま
    if (!href || href.startsWith("#")) return _match;

    let newAttrs = attrs;

    if (base && !/^https?:\/\//i.test(href) && !href.startsWith("data:")) {
      try {
        const absolute = new URL(href, base).href;
        newAttrs = newAttrs.replace(/\bhref\s*=\s*["'][^"']*["']/i, `href="${absolute}"`);
      } catch {
        /* 変換失敗時はそのまま */
      }
    }

    // target 属性を上書きして必ず新しいタブで開く
    if (/\btarget\s*=/i.test(newAttrs)) {
      newAttrs = newAttrs.replace(
        /\btarget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
        'target="_blank"',
      );
    } else {
      newAttrs += ' target="_blank"';
    }

    // rel 属性に noopener noreferrer を付与（既存値があれば追記）
    // (["'])…\1 で quoted、[^\s"'>]+ で unquoted の両形式を 1 つのパターンで捕捉する。
    // クォートなし rel を放置すると rel 属性が 2 つ生成され、ブラウザは最初の値（noopener なし）を優先するため
    // noopener noreferrer が無効になるセキュリティリスクがある。
    const relMatch = newAttrs.match(/\brel\s*=\s*(?:(["'])([^"']*)(\1)|([^\s"'>]+))/i);
    if (relMatch) {
      const existing = relMatch[2] ?? relMatch[4] ?? "";
      const values = new Set(existing.split(/\s+/).filter(Boolean));
      values.add("noopener");
      values.add("noreferrer");
      newAttrs = newAttrs.replace(
        /\brel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i,
        `rel="${[...values].join(" ")}"`,
      );
    } else {
      newAttrs += ' rel="noopener noreferrer"';
    }

    return `<a${newAttrs}>`;
  });
}

/**
 * 共通後処理パイプライン（画像処理・リンク修正・テーブルラップ・XSS サニタイズ）。
 * postProcess / postProcessMarkdownContent の両方で使用する。
 *
 * 順序依存あり — 変更禁止:
 *   1. fixImageDimensions: 相対パスを pageUrl ベースで絶対 URL 化 + loading="lazy" 付与
 *   2. rewriteImageUrls:   絶対 URL 化済みの src を /api/image-proxy 経由に書き換え（1 の後が必須）
 *   3. fixExternalLinks:   <a> href も同様に絶対 URL 化 + target="_blank" rel 付与
 *   4. wrapTables:         <table> をレスポンシブラッパーで包む
 *   5. sanitizeHtml:       XSS 除去（必ず最後。これ以降に処理を追加しても無効化される）
 */
export function applyCorePipeline(html: string, pageUrl = ""): string {
  let h = fixImageDimensions(html, pageUrl);
  h = rewriteImageUrls(h);
  h = fixExternalLinks(h, pageUrl);
  h = wrapTables(h);
  return sanitizeHtml(h);
}

/**
 * コンテンツ抽出後の後処理パイプライン。
 *
 * 前処理ステップ（この関数内）:
 *   1. removeNoise:              EC ギャラリー / Qiita・Zenn UI のノイズ除去（後段の正規表現をシンプル化）
 *   2. transformZennLinkEmbeds:  embed.zenn.studio の iframe を外部リンクに変換（sanitize 前に変換しないと blockquote が除去される）
 *                                通常は extractMainContent 側で Readability 実行前に変換済みのため no-op となる。
 *                                regex フォールバック経路や Markdown 経路の安全網として保持する（冪等）。
 *   3. transformZennMermaidEmbeds: zenn.dev の mermaid iframe を <pre><code> に変換（同上、冪等な安全網）
 *   4. fixLazyImages:            data-src → src 解決 / Shopify _NNNx → _800x 高解像度化
 *   5. removeSmallThumbnailImages: WordPress サムネイル (-NxN) の除去
 *
 * 後処理は applyCorePipeline に委譲（fixImageDimensions → rewriteImageUrls → fixExternalLinks → wrapTables → sanitizeHtml）。
 *
 * X ツイート埋め込み（blockquote.twitter-tweet）はテーマ依存のため、
 * サーバー側ではなくクライアント側の processContent() (embed-utils.ts) で変換する。
 * blockquote は sanitizeHtml で除去されないため、キャッシュ後もクライアントで正しいテーマが適用される。
 */
export function postProcess(content: string, pageUrl = ""): string {
  let h = removeNoise(content);
  h = transformZennLinkEmbeds(h);
  h = transformZennMermaidEmbeds(h, pageUrl);
  h = fixLazyImages(h);
  h = removeSmallThumbnailImages(h);
  return applyCorePipeline(h, pageUrl);
}

/**
 * Markdown → HTML 変換後の後処理パイプライン。
 * Zenn embed 等は変換時に消失するため、共通後処理（画像処理・テーブル・サニタイズ）のみ適用する。
 * sanitizeHtml は XSS 対策のため必ず最後に実行すること。
 */
export function postProcessMarkdownContent(html: string, pageUrl = ""): string {
  return applyCorePipeline(html, pageUrl);
}
