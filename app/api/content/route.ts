import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { isValidFeedUrl } from '@/lib/url';
import { sanitizeHtml } from '@/lib/html';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sha256Hex } from '@/lib/r2';

const CONTENT_CACHE_TTL_SEC = 7 * 24 * 60 * 60; // 7日

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/**
 * img タグの後処理:
 * - 固定 width / height 属性を除去してレスポンシブ表示を保証
 * - 相対パスの src を pageUrl ベースで絶対 URL に変換（404 防止）
 * - loading="lazy" を自動挿入（ブラウザネイティブ遅延ロード）
 * - 壊れた画像を非表示にする onerror ハンドラを追加
 */
function fixImageDimensions(html: string, pageUrl = ''): string {
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

    // 壊れた画像を非表示
    if (!/\bonerror\s*=/i.test(a)) a += ' onerror="this.style.display=\'none\'"';

    return `<img${a}>`;
  });
}

/**
 * table タグをレスポンシブスクロール可能なラッパーで包む。
 */
function wrapTables(html: string): string {
  return html.replace(
    /(<table\b[^>]*>[\s\S]*?<\/table>)/gi,
    '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1.25em 0">$1</div>',
  );
}

/**
 * img タグ配列から CSS scroll-snap スライダー HTML を生成する。
 * removeNoise の EC ギャラリー変換と shopifyDesc の商品画像ギャラリーで共用。
 */
function buildImageSlider(imgs: string[]): string {
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
function removeNoise(html: string): string {
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
 * Zenn の mermaid embed iframe を mermaid ソースのコードブロックに変換する。
 * embed.zenn.studio/mermaid は親ページの Zenn スクリプト（postMessage）がないと
 * "Loading..." のまま表示されるため、data-content から直接ソースを取り出す。
 * zenn.dev のみ適用。他ドメイン（classmethod 等）では変換しない。
 */
function transformZennMermaidEmbeds(content: string, pageUrl = ''): string {
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
function fixLazyImages(html: string): string {
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

/** コンテンツ抽出後の後処理パイプライン */
function postProcess(content: string, pageUrl = ''): string {
  return sanitizeHtml(
    wrapTables(
      fixImageDimensions(
        fixLazyImages(
          transformZennMermaidEmbeds(
            removeNoise(content),
            pageUrl,
          ),
        ),
        pageUrl,
      ),
    ),
  );
}

/**
 * HTTP レスポンスから文字エンコーディングを検出する。
 * 優先順位: Content-Type ヘッダー → HTML meta charset → UTF-8 フォールバック
 * Shift-JIS / EUC-JP など非 UTF-8 ページ（ITMedia 等）の文字化けを防ぐ。
 */
function detectCharset(contentType: string, bodyBytes: Uint8Array): string {
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
 * <head> / <nav> / <header> 等のページクローム要素を除去してコンテンツ部分のみ残す。
 */
function stripPageChrome(html: string): string {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function extractMainContent(html: string, pageUrl: string): string {
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

export async function GET(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  if (!isValidFeedUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const { ctx } = await getCloudflareContext({ async: true });
  const reqUrl = new URL(request.url);
  const cacheKey = new Request(`${reqUrl.origin}/__cache/content/${await sha256Hex(url)}`);
  const cfCache = caches.default;

  // Cloudflare Cache API で確認
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    const data = await cached.json() as { content: string };
    return NextResponse.json(data);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader/1.0)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return NextResponse.json({ error: `${res.status} ${res.statusText}` }, { status: 502 });

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html')) return NextResponse.json({ error: 'Not an HTML page' }, { status: 415 });

    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_BYTES)
      return NextResponse.json({ error: 'Page too large' }, { status: 413 });

    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'No response body' }, { status: 502 });

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_CONTENT_BYTES) return NextResponse.json({ error: 'Page too large' }, { status: 413 });
        chunks.push(value);
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    const charset = detectCharset(ct, merged);
    const html = new TextDecoder(charset).decode(merged);
    const content = extractMainContent(html, url);

    // Cloudflare Cache API に保存（fire-and-forget）
    const cacheRes = new Response(JSON.stringify({ content }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CONTENT_CACHE_TTL_SEC}` },
    });
    ctx.waitUntil(cfCache.put(cacheKey, cacheRes));

    return NextResponse.json({ content });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError')
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    console.error('[content] fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch page' }, { status: 502 });
  }
}
