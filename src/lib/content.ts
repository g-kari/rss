/**
 * 記事全文取得・コンテンツ抽出ユーティリティ
 *
 * app/api/content/route.ts の HTTP ハンドラから分離したコンテンツ処理ロジック。
 * - HTML からのメインコンテンツ抽出
 * - 後処理パイプライン（ノイズ除去・画像処理・テーブルラップ・XSS サニタイズ）
 * - 文字エンコーディング検出
 * - Cloudflare AI toMarkdown API フォールバック
 */
import { marked } from 'marked';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom/worker';
import { sanitizeHtml } from './html';

/**
 * img タグの後処理:
 * - 固定 width / height 属性を除去してレスポンシブ表示を保証
 * - 相対パスの src を pageUrl ベースで絶対 URL に変換（404 防止）
 * - loading="lazy" を自動挿入（ブラウザネイティブ遅延ロード）
 *
 * 注意: onerror ハンドラは sanitizeHtml で除去されるため付与しない。
 * 画像は /api/image-proxy 経由で配信され、失敗時は透明 GIF が返るため
 * broken image アイコンは発生しない。
 */
export function fixImageDimensions(html: string, pageUrl = ''): string {
  let base: URL | null = null;
  try { base = pageUrl ? new URL(pageUrl) : null; } catch { /* ignore */ }

  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    let a = attrs
      .replace(/\s+width\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\s+height\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\s+style\s*=\s*"([^"]*)"/gi, (_s, style: string) => {
        const s2 = style.replace(/\b(?:width|height)\s*:[^;]+;?/gi, '').trim();
        return s2 ? ` style="${s2}"` : '';
      })
      .replace(/\s+style\s*=\s*'([^']*)'/gi, (_s, style: string) => {
        const s2 = style.replace(/\b(?:width|height)\s*:[^;]+;?/gi, '').trim();
        return s2 ? ` style="${s2}"` : '';
      });

    // 相対パスを絶対 URL に変換
    if (base) {
      a = a.replace(/\bsrc=["']([^"']+)["']/gi, (_sm, src: string) => {
        if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return _sm;
        try { return `src="${new URL(src, base).href}"`; } catch { return _sm; }
      });
    }

    // loading="lazy" を追加（既存の loading 属性がなければ）
    if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';

    return `<img${a}>`;
  });
}

/**
 * table タグをレスポンシブスクロール可能なラッパーで包む。
 */
export function wrapTables(html: string): string {
  return html.replace(
    /(<table\b[^>]*>[\s\S]*?<\/table>)/gi,
    '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1.25em 0">$1</div>',
  );
}

/**
 * img タグ配列から CSS scroll-snap スライダー HTML を生成する。
 * removeNoise の EC ギャラリー変換と shopifyDesc の商品画像ギャラリーで共用。
 */
export function buildImageSlider(imgs: string[]): string {
  if (imgs.length === 0) return '';
  const slides = imgs
    .map(
      (img) =>
        `<div style="flex:0 0 100%;scroll-snap-align:start;overflow:hidden;border-radius:8px;background:#f5f5f5;aspect-ratio:1/1">` +
        img.replace(/<img\b/, '<img style="width:100%;height:100%;object-fit:contain;display:block"') +
        `</div>`,
    )
    .join('');
  return (
    `<div style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:0;` +
    `margin:0 0 1.25em;border-radius:8px;-webkit-overflow-scrolling:touch;scrollbar-width:none">` +
    slides +
    `</div>`
  );
}

/**
 * サイト固有のノイズ要素を除去する。
 * Qiita / Zenn に見られる「いいね」「シェア」「関連記事」等のUIを取り除く。
 */
export function removeNoise(html: string): string {
  // Qiita: header/footer ツールバー、サイドバー
  html = html.replace(/<div[^>]+class="[^"]*(?:LikesButton|StockButton|ShareButtons|SideBar|ArticleHeader|ArticleFooter|FollowButton)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // Zenn: チャプター選択、関連記事
  html = html.replace(/<div[^>]+class="[^"]*(?:ChapterList|RelatedArticles|TocItem)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // 汎用: "related", "recommend", "share", "sns" を含む div
  html = html.replace(/<div[^>]+class="[^"]*(?:related|recommend|share|sns|toc-|side-)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // EC / Shopify: 商品画像ギャラリーを CSS scroll-snap スライダーに変換
  html = html.replace(
    /<(?:ul|div)[^>]+class="[^"]*(?:product__media|media-gallery|product-gallery|thumbnail[s]?(?:-list|-wrapper)?|image-gallery|photo-gallery|product-images)[^"]*"[^>]*>([\s\S]*?)<\/(?:ul|div)>/gi,
    (_match, inner: string) => {
      const imgs = [...inner.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
      return buildImageSlider(imgs);
    },
  );
  return html;
}

/**
 * embed.zenn.studio/card iframe を外部リンクに変換する。
 *
 * Zenn CMS が生成する card embed は以下の形式:
 * <span class="embed-block zenn-embedded zenn-embedded-card">
 *   <iframe src="https://embed.zenn.studio/card#zenn-embedded__xxx"
 *     data-content="https%3A%2F%2Fexample.com%2Farticle"
 *     ...></iframe>
 * </span>
 *
 * embed.zenn.studio の iframe は親ページの Zenn JS（postMessage）がないと
 * "Loading..." のまま表示されるため、data-content から元 URL を取り出してリンクに変換する。
 * zenn.dev / 非 zenn.dev を問わず全ドメインで適用する。
 */
export function transformZennCardEmbeds(content: string): string {
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-card\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const dcMatch = spanMatch.match(/\bdata-content=["']([^"']+)["']/i);
      if (!dcMatch) return spanMatch;
      try {
        const url = decodeURIComponent(dcMatch[1]);
        // javascript: / data: 等の危険スキームをブロック（XSS 防止）
        if (!/^https?:\/\//i.test(url)) return spanMatch;
        return `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
      } catch {
        return spanMatch;
      }
    },
  );
}

/**
 * embed.zenn.studio/tweet iframe を外部リンクに変換する。
 *
 * Zenn CMS が生成する tweet embed は以下の形式:
 * <span class="embed-block zenn-embedded zenn-embedded-tweet">
 *   <iframe src="https://embed.zenn.studio/tweet#zenn-embedded__xxx"
 *     data-content="https%3A%2F%2Fx.com%2Fuser%2Fstatus%2F123"
 *     ...></iframe>
 * </span>
 *
 * card embed と同様に JS なしでは表示されないため、data-content から元 URL を取り出してリンクに変換する。
 */
export function transformZennTweetEmbeds(content: string): string {
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-tweet\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const dcMatch = spanMatch.match(/\bdata-content=["']([^"']+)["']/i);
      if (!dcMatch) return spanMatch;
      try {
        const url = decodeURIComponent(dcMatch[1]);
        // javascript: / data: 等の危険スキームをブロック（XSS 防止）
        if (!/^https?:\/\//i.test(url)) return spanMatch;
        return `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
      } catch {
        return spanMatch;
      }
    },
  );
}

/**
 * Zenn の mermaid embed iframe を mermaid ソースのコードブロックに変換する。
 * embed.zenn.studio/mermaid は親ページの Zenn スクリプト（postMessage）がないと
 * "Loading..." のまま表示されるため、data-content から直接ソースを取り出す。
 * zenn.dev のみ適用。他ドメイン（classmethod 等）では変換しない。
 */
export function transformZennMermaidEmbeds(content: string, pageUrl = ''): string {
  if (!pageUrl.includes('zenn.dev')) return content;
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-mermaid\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const dcMatch = spanMatch.match(/\bdata-content=["']([^"']+)["']/i);
      if (!dcMatch) return spanMatch;
      try {
        const source = decodeURIComponent(dcMatch[1]);
        const escaped = source
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return (
          `<pre style="background:var(--color-surface-subtle,#f3f3f1);` +
          `border:1px solid var(--color-border-default,#e7e5e4);` +
          `border-radius:6px;padding:1em;overflow-x:auto;white-space:pre">` +
          `<code class="language-mermaid">${escaped}</code></pre>`
        );
      } catch {
        return spanMatch;
      }
    },
  );
}

/**
 * JS 遅延ロード画像と Shopify サムネイルを高解像度に解決する。
 * - data-src が有効 URL（{width} プレースホルダー含む）→ 800px 幅に解決して src を上書き
 * - src の Shopify サイズサフィックス（_300x300 等）→ _800x に置換
 */
export function fixLazyImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    let fixed = attrs;

    const dataSrcMatch = fixed.match(/\bdata-src=["']([^"']+)["']/i);
    if (dataSrcMatch) {
      const resolved = dataSrcMatch[1].replace(/\{width\}/g, '800');
      if (/\bsrc=["'][^"']*["']/i.test(fixed)) {
        fixed = fixed.replace(/\bsrc=["'][^"']*["']/i, `src="${resolved}"`);
      } else {
        // src 属性なしの遅延ロード画像: src を先頭に追加
        fixed = ` src="${resolved}"` + fixed;
      }
    }

    // Shopify: _NNNx / _NNNxNNN / _NNNx@Nx サフィックスを _800x に置換
    fixed = fixed.replace(
      /(src=["'][^"']*?)_\d+x\d*(?:@\d+x)?\.(jpg|jpeg|png|webp|gif)(["'])/gi,
      '$1_800x.$2$3',
    );

    return `<img${fixed}>`;
  });
}

/**
 * 記事本文内の外部画像 URL を /api/image-proxy 経由に書き換える。
 * fixImageDimensions で相対パスが絶対 URL に解決された後に適用する。
 */
export function rewriteImageUrls(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    const rewritten = attrs.replace(
      /\bsrc=["'](https?:\/\/[^"']+)["']/gi,
      (_sm, src: string) => `src="/api/image-proxy?url=${encodeURIComponent(src)}"`,
    );
    return `<img${rewritten}>`;
  });
}

/**
 * コンテンツ抽出後の後処理パイプライン。
 * 各ステップを適用順に並べる。sanitizeHtml は XSS 対策のため必ず最後に実行すること。
 */
export function postProcess(content: string, pageUrl = ''): string {
  const steps: Array<(html: string) => string> = [
    (html) => removeNoise(html),
    (html) => transformZennCardEmbeds(html),
    (html) => transformZennTweetEmbeds(html),
    (html) => transformZennMermaidEmbeds(html, pageUrl),
    (html) => fixLazyImages(html),
    (html) => fixImageDimensions(html, pageUrl),
    (html) => rewriteImageUrls(html),
    (html) => wrapTables(html),
    (html) => sanitizeHtml(html),
  ];
  return steps.reduce((html, step) => step(html), content);
}

/**
 * HTTP レスポンスから文字エンコーディングを検出する。
 * 優先順位: Content-Type ヘッダー → HTML meta charset → UTF-8 フォールバック
 * Shift-JIS / EUC-JP など非 UTF-8 ページ（ITMedia 等）の文字化けを防ぐ。
 */
export function detectCharset(contentType: string, bodyBytes: Uint8Array): string {
  const ctMatch = contentType.match(/charset\s*=\s*([^\s;]+)/i);
  if (ctMatch?.[1]) return ctMatch[1];

  const preview = new TextDecoder('latin1').decode(bodyBytes.slice(0, 2048));

  const metaCharset = preview.match(/<meta\b[^>]+charset\s*=\s*["']?([^"'\s;>]+)/i)?.[1];
  if (metaCharset) return metaCharset;

  const metaHttp = preview.match(
    /<meta\b[^>]+content\s*=\s*["'][^"']*;\s*charset\s*=\s*([^"'\s;>]+)/i,
  )?.[1];
  if (metaHttp) return metaHttp;

  return 'utf-8';
}

/**
 * 抽出された HTML コンテンツが十分かどうかを判定する。
 * タグを除去したテキスト量が minChars 未満の場合は不十分と判断する。
 */
export function isContentSufficient(html: string, minChars = 200): boolean {
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text.length >= minChars;
}

/**
 * Cloudflare AI toMarkdown API に HTML を送信して Markdown を取得する。
 * CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN が未設定の場合は null を返す。
 */
export async function fetchMarkdownFromHtml(
  html: string,
  hostname: string,
): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;

  try {
    const formData = new FormData();
    formData.append('files', new Blob([html], { type: 'text/html' }), 'page.html');
    formData.append('conversionOptions', JSON.stringify({ hostname }));

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/tomarkdown`,
      { method: 'POST', headers: { Authorization: `Bearer ${apiToken}` }, body: formData },
    );
    if (!res.ok) return null;

    const json = await res.json() as {
      result: { data?: string; error?: string }[];
      success: boolean;
    };
    return json.success ? (json.result[0]?.data ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Markdown を HTML に変換する（marked 使用）。
 */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Markdown → HTML 変換後の後処理パイプライン。
 * Zenn embed 等は変換時に消失するため、画像処理・テーブル・サニタイズのみ適用する。
 * sanitizeHtml は XSS 対策のため必ず最後に実行すること。
 */
export function postProcessMarkdownContent(html: string, pageUrl = ''): string {
  const steps: Array<(h: string) => string> = [
    (h) => fixImageDimensions(h, pageUrl),
    (h) => rewriteImageUrls(h),
    (h) => wrapTables(h),
    (h) => sanitizeHtml(h),
  ];
  return steps.reduce((h, step) => step(h), html);
}

/**
 * Readability 実行前の前処理。DOM パース精度を上げるためノイズを除去する。
 * - <picture> を単純化して <img> のみ残す
 * - <noscript> 内の画像を救出（遅延ロード対策）
 * - 不要な属性を除去（data-content / data-src は保持）
 * - <style> / <script> を除去
 */
export function preClean(html: string): string {
  let h = html;
  h = h.replace(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi, (_m, inner: string) => {
    const img = inner.match(/<img\b[^>]*>/i);
    return img ? img[0] : '';
  });
  h = h.replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi, (_m, inner: string) =>
    /<img\b/i.test(inner) ? inner : '',
  );
  h = h.replace(/\s+(?:data-(?!content\b|src\b)[a-z][a-z0-9-]*|aria-[a-z-]+|on[a-z]+)=["'][^"']*["']/gi, '');
  h = h.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  h = h.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  return h;
}

/**
 * @mozilla/readability + linkedom/worker を使って記事本文を抽出する。
 * 失敗した場合は null を返す（fail-open 設計）。
 */
export function extractWithReadability(html: string, url: string): string | null {
  try {
    const { document } = parseHTML(preClean(html));
    try {
      const base = document.createElement('base');
      (base as unknown as { href: string }).href = url;
      document.head.appendChild(base);
    } catch { /* ignore */ }

    const article = new Readability(document as unknown as Document).parse();
    return article?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * <head> / <nav> / <header> 等のページクローム要素を除去してコンテンツ部分のみ残す。
 */
export function stripPageChrome(html: string): string {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * HTML からメインコンテンツを抽出する。
 * Readability.js 優先、失敗時は正規表現ベースにフォールバックする。
 * - readability: @mozilla/readability + linkedom で高精度抽出
 * - regex: サイト固有セレクター → EC セレクター → 汎用セレクターのフォールバック
 */
export function extractMainContent(
  html: string,
  pageUrl: string,
): { content: string; source: 'readability' | 'regex' } {
  const rc = extractWithReadability(html, pageUrl);
  if (rc && isContentSufficient(rc)) {
    return { content: postProcess(rc, pageUrl), source: 'readability' };
  }
  return { content: extractWithRegex(html, pageUrl), source: 'regex' };
}

/**
 * 正規表現ベースのフォールバック抽出。
 * サイト固有セレクター → EC 商品ページ → 汎用セレクターの順でフォールバックする。
 */
function extractWithRegex(html: string, pageUrl: string): string {
  const cleaned = stripPageChrome(html);

  // --- サイト固有セレクター ---

  // Qiita: itemprop="articleBody" または class="it-MdContent"
  const qiitaBody = cleaned.match(/<(\w+)[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*)<\/\1>/i);
  if (qiitaBody?.[2]) return postProcess(qiitaBody[2], pageUrl);

  const qiitaMd = cleaned.match(/<(\w+)[^>]+class=["'][^"']*it-MdContent[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (qiitaMd?.[2]) return postProcess(qiitaMd[2], pageUrl);

  // Zenn (zenn.dev): class="znc" を <article> より優先
  // 他ドメイン (classmethod 等 Zenn の記事システムを流用するサイト) では
  // <article> を先に試し、なければ znc にフォールバックする
  const zncMatch = cleaned.match(/<(\w+)[^>]+class=["'][^"']*\bznc\b[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (zncMatch?.[2] && pageUrl.includes('zenn.dev')) return postProcess(zncMatch[2], pageUrl);

  // --- EC / 商品ページセレクター ---

  // Schema.org itemprop="description" (Shopify 等の EC サイト全般)
  const schemaDesc = cleaned.match(/<(\w+)[^>]+itemprop=["']description["'][^>]*>([\s\S]*)<\/\1>/i);
  if (schemaDesc?.[2]) return postProcess(schemaDesc[2], pageUrl);

  // Shopify: product__description / product-single__description / product-description 等
  // description は通常テキストのみなので、商品メイン画像を別途収集して先頭に付与する
  const shopifyDesc = cleaned.match(/<(\w+)[^>]+class=["'][^"']*product[^"']*description[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (shopifyDesc?.[2]) {
    const mainImgs = [...cleaned.matchAll(/<img\b[^>]*\bproduct-featured-media\b[^>]*>/gi)].map((m) => m[0]);
    return postProcess(buildImageSlider(mainImgs) + shopifyDesc[2], pageUrl);
  }

  // --- 汎用セレクター ---

  const article = cleaned.match(/<article\b[^>]*>([\s\S]*)<\/article>/i);
  if (article?.[1]) return postProcess(article[1], pageUrl);

  // 非 zenn.dev で <article> なし、znc がある場合のフォールバック
  if (zncMatch?.[2]) return postProcess(zncMatch[2], pageUrl);

  const main = cleaned.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  if (main?.[1]) return postProcess(main[1], pageUrl);

  const roleMain = cleaned.match(/<(\w+)[^>]+role=["']main["'][^>]*>([\s\S]*)<\/\1>/i);
  if (roleMain?.[2]) return postProcess(roleMain[2], pageUrl);

  const classContent = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*(?:post|entry|article|content)[^"']*["'][^>]*>([\s\S]*)<\/\1>/i,
  );
  if (classContent?.[2]) return postProcess(classContent[2], pageUrl);

  const body = cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return postProcess(body?.[1] ?? cleaned, pageUrl);
}
