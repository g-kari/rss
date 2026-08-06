/**
 * HTML 埋め込み変換モジュール
 *
 * Zenn / X (Twitter) / SpeakerDeck / SlideShare 等の
 * 埋め込みコンテンツを変換する関数群。
 * html-post-processor.ts から分割。
 */
import { escapeHtml } from "./html";
import { isZennDevUrl, isAbsoluteHttpUrl } from "./url";

/**
 * Zenn embed の <span> から data-content 属性を URL デコードして取り出す共通ヘルパー。
 * デコード失敗時または属性が存在しない場合は null を返す。
 */
function extractZennEmbedContent(spanMatch: string): string | null {
  const dcMatch = spanMatch.match(/\bdata-content=["']([^"']+)["']/i);
  if (!dcMatch) return null;
  try {
    return decodeURIComponent(dcMatch[1]);
  } catch {
    return null;
  }
}

/**
 * embed.zenn.studio の card / tweet iframe を外部リンクに変換する。
 *
 * Zenn CMS が生成する embed は以下のいずれかの形式:
 * <span class="embed-block zenn-embedded zenn-embedded-card">
 * <span class="embed-block zenn-embedded zenn-embedded-tweet">
 *   <iframe src="https://embed.zenn.studio/{type}#zenn-embedded__xxx"
 *     data-content="https%3A%2F%2F..."
 *     ...></iframe>
 * </span>
 *
 * embed.zenn.studio の iframe は親ページの Zenn JS（postMessage）がないと
 * "Loading..." のまま表示されるため、data-content から元 URL を取り出してリンクに変換する。
 * zenn.dev / 非 zenn.dev を問わず全ドメインで適用する。
 */
export function transformZennLinkEmbeds(content: string): string {
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-(?:card|tweet)\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const url = extractZennEmbedContent(spanMatch);
      if (url === null) return spanMatch;
      // javascript: / data: 等の危険スキームをブロック（XSS 防止）
      if (!isAbsoluteHttpUrl(url)) return spanMatch;
      // URL に " < > & が含まれる場合にHTML属性から脱出されないようHTMLエスケープ
      const escaped = escapeHtml(url);
      return `<p><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></p>`;
    },
  );
}

/**
 * Zenn の mermaid embed iframe を mermaid ソースのコードブロックに変換する。
 * embed.zenn.studio/mermaid は親ページの Zenn スクリプト（postMessage）がないと
 * "Loading..." のまま表示されるため、data-content から直接ソースを取り出す。
 * zenn.dev のみ適用。他ドメイン（classmethod 等）では変換しない。
 */
export function transformZennMermaidEmbeds(content: string, pageUrl = ""): string {
  if (!isZennDevUrl(pageUrl)) return content;
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-mermaid\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const source = extractZennEmbedContent(spanMatch);
      if (source === null) return spanMatch;
      const escaped = escapeHtml(source);
      return (
        `<pre style="background:var(--color-surface-subtle,#f3f3f1);` +
        `border:1px solid var(--color-border-default,#e7e5e4);` +
        `border-radius:6px;padding:1em;overflow-x:auto;white-space:pre">` +
        `<code class="language-mermaid">${escaped}</code></pre>`
      );
    },
  );
}

/**
 * `<blockquote class="twitter-tweet">` を X (Twitter) 埋め込み iframe に変換する。
 *
 * 多くのブログ・メディアサイトは Twitter のスクリプトと一緒に
 * <blockquote class="twitter-tweet"> を使ってツイートを埋め込む。
 * RSS リーダーは <script> を除去するため tweet が未展開のまま残ってしまう。
 * このため blockquote 末尾のパーマリンク URL からツイート ID を取り出し、
 * platform.twitter.com の iframe 埋め込みに置き換える。
 *
 * @param theme - ライト/ダークテーマ（'light' | 'dark'、省略時は 'light'）
 */
export function transformXTweetEmbeds(html: string, theme: "light" | "dark" = "light"): string {
  return html.replace(
    /<blockquote\b[^>]*\bclass\s*=\s*["'][^"']*\btwitter-tweet\b[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_match, inner: string) => {
      // blockquote 内の最後のリンクがツイートのパーマリンク
      let tweetUrl = "";
      for (const link of inner.matchAll(/<a\b[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
        tweetUrl = link[1] ?? "";
      }
      const idMatch = tweetUrl.match(/(?:twitter|x)\.com\/[^/?#]+\/status\/(\d+)/);
      if (!idMatch) return _match; // パターン不一致なら元のブロッククォートを保持
      const tweetId = idMatch[1];
      return (
        `<div class="tweet-embed-wrapper">` +
        `<iframe` +
        ` src="https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true&theme=${theme}"` +
        ` style="width:100%;border:0;border-radius:12px;height:300px"` +
        ` scrolling="no"` +
        ` loading="lazy"` +
        `></iframe>` +
        `</div>`
      );
    },
  );
}

/**
 * SpeakerDeck の `<script class="speakerdeck-embed" data-id="...">` タグを
 * `<iframe>` に変換する。
 *
 * ブログ記事は SpeakerDeck の JS embed コードをそのまま貼り付けていることが多いが、
 * RSS リーダーは `<script>` を除去するためスライドが表示されなくなる。
 * preClean で `<script>` が除去される前にこの関数を呼び出し、
 * data-id からプレイヤー iframe を生成して差し替える。
 */
export function transformSpeakerDeckScriptEmbeds(html: string): string {
  return html.replace(
    /<script\b[^>]*\bclass=["'][^"']*\bspeakerdeck-embed\b[^"']*["'][^>]*(?:\/>|>[\s\S]*?<\/script\s*>)/gi,
    (match) => {
      const idMatch = match.match(/\bdata-id=["']([a-f0-9]+)["']/i);
      if (!idMatch) return match;
      const dataId = idMatch[1];

      const ratioMatch = match.match(/\bdata-ratio=["']([0-9.]+)["']/i);
      const ratio = ratioMatch ? parseFloat(ratioMatch[1]) : 0;
      const aspectRatio = ratio > 0 ? `${Math.round(ratio * 315)}/${315}` : "560/315";

      return (
        `<iframe class="speakerdeck-iframe"` +
        ` src="https://speakerdeck.com/player/${dataId}"` +
        ` allowfullscreen="true"` +
        ` style="border:0;width:100%;aspect-ratio:${aspectRatio}"` +
        ` loading="lazy"></iframe>`
      );
    },
  );
}

/**
 * 記事本文中の SlideShare へのリンクを iframe 埋め込みに変換する。
 *
 * ブログ記事はスライドサービスへの URL をそのまま `<a>` で貼っていることが多い。
 * Readability 通過後もリンクのまま残るため、この関数で iframe に差し替える。
 *
 * 対象パターン:
 * - `<a href="https://www.slideshare.net/slideshow/{slug}/{id}">...</a>`
 *
 * SpeakerDeck は `<script class="speakerdeck-embed">` → iframe 変換が
 * `transformSpeakerDeckScriptEmbeds` で対応済み。リンク URL からは
 * player ID を取得できないため、リンク→iframe 変換は行わない。
 */
export function transformSlideShareEmbedLinks(html: string): string {
  return html.replace(
    /<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/(?:www\.)?slideshare\.net\/slideshow\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi,
    (match, url: string) => {
      const ss = url.match(/slideshare\.net\/slideshow\/[^/"']+\/(\d+)/);
      if (!ss) return match;
      const slideId = ss[1];
      return (
        `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.25em 0;border-radius:8px">` +
        `<iframe src="https://www.slideshare.net/slideshow/embed_code/${slideId}"` +
        ` style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"` +
        ` loading="lazy" allowfullscreen></iframe>` +
        `</div>` +
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;font-size:11px;margin-top:4px;margin-bottom:8px;opacity:0.55">SlideShare で見る ↗</a>`
      );
    },
  );
}
