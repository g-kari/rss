import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { isValidFeedUrl } from '@/lib/url';
import { sanitizeHtml } from '@/lib/html';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/**
 * img タグの固定 width / height 属性を除去してレスポンシブ表示を保証する。
 * CSS で max-width: 100% を指定しているが、inline style や属性の上書きに対応する。
 */
function fixImageDimensions(html: string): string {
  // width/height 属性を除去
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s+width\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\s+height\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
      // inline style の width/height も除去
      .replace(/\s+style\s*=\s*"([^"]*)"/gi, (_s, style: string) => {
        const cleaned2 = style.replace(/\b(?:width|height)\s*:[^;]+;?/gi, '').trim();
        return cleaned2 ? ` style="${cleaned2}"` : '';
      })
      .replace(/\s+style\s*=\s*'([^']*)'/gi, (_s, style: string) => {
        const cleaned2 = style.replace(/\b(?:width|height)\s*:[^;]+;?/gi, '').trim();
        return cleaned2 ? ` style="${cleaned2}"` : '';
      });
    return `<img${cleaned}>`;
  });
}

/**
 * table タグをレスポンシブスクロール可能なラッパーで包む。
 * globals.css の .article-content table では display: block + overflow-x: auto を指定しているが、
 * ネストされた table には table タグの display 制御だけでは不十分なケースがあるため wrapper で補完する。
 */
function wrapTables(html: string): string {
  return html.replace(
    /(<table\b[^>]*>[\s\S]*?<\/table>)/gi,
    '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1.25em 0">$1</div>',
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
    (_match, inner) => {
      const imgs = [...inner.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
      if (imgs.length === 0) return '';
      const slides = imgs.map((img) =>
        `<div style="flex:0 0 100%;scroll-snap-align:start;overflow:hidden;border-radius:8px;background:#f5f5f5;aspect-ratio:1/1">` +
        img.replace(/<img\b/, '<img style="width:100%;height:100%;object-fit:contain;display:block"') +
        `</div>`,
      ).join('');
      return `<div style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:0;margin:0 0 1.25em;border-radius:8px;-webkit-overflow-scrolling:touch;scrollbar-width:none">${slides}</div>`;
    },
  );
  return html;
}

function extractMainContent(html: string, pageUrl: string): string {
  const cleaned = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  function postProcess(content: string): string {
    const noised = removeNoise(content);
    const imgFixed = fixImageDimensions(noised);
    const tableFixed = wrapTables(imgFixed);
    return sanitizeHtml(tableFixed);
  }

  // --- サイト固有セレクター ---

  // Qiita: itemprop="articleBody" または class="it-MdContent"
  // (\w+) でタグ名を捕捉し \1 で閉じタグを一致させる。greedy で末尾まで取得。
  const qiitaBody = cleaned.match(/<(\w+)[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*)<\/\1>/i);
  if (qiitaBody?.[2]) return postProcess(qiitaBody[2]);

  const qiitaMd = cleaned.match(/<(\w+)[^>]+class=["'][^"']*it-MdContent[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (qiitaMd?.[2]) return postProcess(qiitaMd[2]);

  // Zenn: class="znc"
  const zennContent = cleaned.match(/<(\w+)[^>]+class=["'][^"']*\bznc\b[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (zennContent?.[2]) return postProcess(zennContent[2]);

  // --- EC / 商品ページセレクター ---

  // Schema.org itemprop="description" (Shopify 等の EC サイト全般)
  const schemaDesc = cleaned.match(/<(\w+)[^>]+itemprop=["']description["'][^>]*>([\s\S]*)<\/\1>/i);
  if (schemaDesc?.[2]) return postProcess(schemaDesc[2]);

  // Shopify: product__description / product-single__description / product-description 等
  const shopifyDesc = cleaned.match(/<(\w+)[^>]+class=["'][^"']*product[^"']*description[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (shopifyDesc?.[2]) return postProcess(shopifyDesc[2]);

  // --- 汎用セレクター ---

  const article = cleaned.match(/<article\b[^>]*>([\s\S]*)<\/article>/i);
  if (article?.[1]) return postProcess(article[1]);

  const main = cleaned.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  if (main?.[1]) return postProcess(main[1]);

  const roleMain = cleaned.match(/<(\w+)[^>]+role=["']main["'][^>]*>([\s\S]*)<\/\1>/i);
  if (roleMain?.[2]) return postProcess(roleMain[2]);

  const classContent = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*(?:post|entry|article|content)[^"']*["'][^>]*>([\s\S]*)<\/\1>/i,
  );
  if (classContent?.[2]) return postProcess(classContent[2]);

  const body = cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return postProcess(body?.[1] ?? cleaned);
}

export async function GET(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  if (!isValidFeedUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
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
    const html = new TextDecoder().decode(merged);
    return NextResponse.json({ content: extractMainContent(html, url) });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError')
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    console.error('[content] fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch page' }, { status: 502 });
  }
}
