import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';


const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // <base> タグを除去（相対 URL ハイジャック防止）
    .replace(/<base\b[^>]*\/?>/gi, '')
    // <object>, <embed> を除去
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    // インラインイベントハンドラを除去（/ 区切りのバイパス対策として [\s/]+ を使用）
    .replace(/[\s/]+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // javascript: スキームを除去（クォートあり・なし両対応）
    .replace(/(?:href|src|action)\s*=\s*["']javascript:[^"']*["']/gi, '')
    .replace(/(?:href|src|action)\s*=\s*javascript:[^\s>]*/gi, '')
    // data: URI を src/href/action から除去（HTML インジェクション防止）
    .replace(/(?:src|href|action)\s*=\s*["']data:[^"']*["']/gi, '')
    .replace(/(?:src|href|action)\s*=\s*data:[^\s>]*/gi, '')
    .trim();
}

function extractMainContent(html: string): string {
  const cleaned = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const article = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1]) return sanitizeHtml(article[1]);

  const main = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1]) return sanitizeHtml(main[1]);

  const roleMain = cleaned.match(/<(\w+)[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/\1>/i);
  if (roleMain?.[2]) return sanitizeHtml(roleMain[2]);

  const classContent = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*(?:post|entry|article)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (classContent?.[2]) return sanitizeHtml(classContent[2]);

  const body = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return sanitizeHtml(body?.[1] ?? cleaned);
}

export async function GET(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  } catch {
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
    return NextResponse.json({ content: extractMainContent(html) });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError')
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
