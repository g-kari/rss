import { test, expect } from '@playwright/test';

/**
 * extractMainContent / detectCharset のロジックを node スクリプトで検証する。
 * サーバー不要・認証不要で実行できる純粋なロジックテスト。
 *
 * 全文取得の正規表現バグ（non-greedy で途中切れ）が再発しないよう
 * 修正後のパターンを回帰テストとして定義する。
 */

// src/lib/content.ts の detectCharset と同一ロジック（複製）
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

// テスト対象と同じ正規表現を抜粋
function extractArticle(html: string): string | null {
  const cleaned = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '');

  const qiitaBody = cleaned.match(/<(\w+)[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*)<\/\1>/i);
  if (qiitaBody?.[2]) return qiitaBody[2];

  const znc = cleaned.match(/<(\w+)[^>]+class=["'][^"']*\bznc\b[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (znc?.[2]) return znc[2];

  const article = cleaned.match(/<article\b[^>]*>([\s\S]*)<\/article>/i);
  if (article?.[1]) return article[1];

  const main = cleaned.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  if (main?.[1]) return main[1];

  return null;
}

test.describe('detectCharset — 文字エンコーディング検出', () => {
  function toBytes(html: string, encoding: string): Uint8Array {
    // TextEncoder は UTF-8 のみなので、Latin-1 範囲内でテスト
    // 実際の Shift-JIS バイト列の代わりに ASCII テキストで charset 検出ロジックを検証
    return new TextEncoder().encode(html);
  }

  test('Content-Type ヘッダーの charset を優先する', () => {
    const bytes = toBytes('<meta charset="utf-8">', 'utf-8');
    expect(detectCharset('text/html; charset=euc-jp', bytes)).toBe('euc-jp');
  });

  test('Content-Type に charset がなければ meta charset を使う', () => {
    const html = '<html><head><meta charset="shift_jis"></head><body></body></html>';
    const bytes = new TextEncoder().encode(html);
    expect(detectCharset('text/html', bytes)).toBe('shift_jis');
  });

  test('meta http-equiv Content-Type の charset を検出する', () => {
    const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-jp"></head></html>';
    const bytes = new TextEncoder().encode(html);
    expect(detectCharset('text/html', bytes)).toBe('euc-jp');
  });

  test('charset が見つからなければ utf-8 を返す', () => {
    const bytes = new TextEncoder().encode('<html><body>hello</body></html>');
    expect(detectCharset('text/html', bytes)).toBe('utf-8');
  });

  test('Content-Type が空でも meta charset を検出する', () => {
    const html = '<!DOCTYPE html><html><head><meta charset="windows-31j"></head></html>';
    const bytes = new TextEncoder().encode(html);
    expect(detectCharset('', bytes)).toBe('windows-31j');
  });
});

// src/lib/content.ts の transformZennMermaidEmbeds と同一ロジック（複製）
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
        return `<pre><code class="language-mermaid">${escaped}</code></pre>`;
      } catch {
        return spanMatch;
      }
    },
  );
}

// src/lib/content.ts の fixLazyImages と同一ロジック（複製）
function fixLazyImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    let fixed = attrs;
    const dataSrcMatch = fixed.match(/\bdata-src=["']([^"']+)["']/i);
    if (dataSrcMatch) {
      const resolved = dataSrcMatch[1].replace(/\{width\}/g, '800');
      if (/\bsrc=["'][^"']*["']/i.test(fixed)) {
        fixed = fixed.replace(/\bsrc=["'][^"']*["']/i, `src="${resolved}"`);
      } else {
        fixed = ` src="${resolved}"` + fixed;
      }
    }
    fixed = fixed.replace(
      /(src=["'][^"']*?)_\d+x\d*(?:@\d+x)?\.(jpg|jpeg|png|webp|gif)(["'])/gi,
      '$1_800x.$2$3',
    );
    return `<img${fixed}>`;
  });
}

test.describe('fixLazyImages — 遅延ロード・Shopify サムネイル解決', () => {
  test('data-src の {width} プレースホルダーを 800 に解決して src を上書きする', () => {
    const html = '<img src="//cdn/file_300x300.jpg" class="lazyload" data-src="//cdn/file_{width}x.jpg">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="//cdn/file_800x.jpg"');
    expect(result).not.toContain('src="//cdn/file_300x300.jpg"');
  });

  test('Shopify _NNNxNNN サフィックスを _800x に置換する', () => {
    const html = '<img src="//cdn/file_300x300.jpg" alt="商品">';
    const result = fixLazyImages(html);
    expect(result).toContain('_800x.jpg');
    expect(result).not.toContain('_300x300.jpg');
  });

  test('Shopify _NNNx@2x サフィックスを _800x に置換する', () => {
    const html = '<img src="//cdn/file_530x@2x.jpg">';
    const result = fixLazyImages(html);
    expect(result).toContain('_800x.jpg');
    expect(result).not.toContain('_530x@2x.jpg');
  });

  test('通常の URL はそのまま保持される', () => {
    const html = '<img src="https://example.com/image.jpg" alt="test">';
    const result = fixLazyImages(html);
    expect(result).toBe(html);
  });

  test('data-src に {width} がない場合もそのまま src に昇格する', () => {
    const html = '<img src="placeholder.gif" data-src="//cdn/image.png">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="//cdn/image.png"');
  });

  test('src なしで data-src だけある遅延ロード画像に src を追加する', () => {
    // Shopify 等で src を省略した完全遅延ロードパターン
    const html = '<img class="lazyload" data-src="//cdn/product_{width}x.jpg" alt="商品">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="//cdn/product_800x.jpg"');
  });
});

// src/lib/content.ts の fixImageDimensions と同一ロジック（複製）
// 注意: onerror ハンドラは sanitizeHtml で除去されるため付与しない。
//       画像は /api/image-proxy 経由で配信され、失敗時は透明 GIF が返る。
function fixImageDimensions(html: string, pageUrl = ''): string {
  let base: URL | null = null;
  try { base = pageUrl ? new URL(pageUrl) : null; } catch { /* ignore */ }

  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    let a = attrs
      .replace(/\s+width\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\s+height\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\s+style\s*=\s*"([^"]*)"/gi, (_s: string, style: string) => {
        const s2 = style.replace(/\b(?:width|height)\s*:[^;]+;?/gi, '').trim();
        return s2 ? ` style="${s2}"` : '';
      })
      .replace(/\s+style\s*=\s*'([^']*)'/gi, (_s: string, style: string) => {
        const s2 = style.replace(/\b(?:width|height)\s*:[^;]+;?/gi, '').trim();
        return s2 ? ` style="${s2}"` : '';
      });

    if (base) {
      a = a.replace(/\bsrc=["']([^"']+)["']/gi, (_sm: string, src: string) => {
        if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return _sm;
        try { return `src="${new URL(src, base as URL).href}"`; } catch { return _sm; }
      });
    }

    if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';

    return `<img${a}>`;
  });
}

test.describe('fixImageDimensions — 画像後処理', () => {
  test('固定 width/height 属性を除去する', () => {
    const html = '<img src="https://example.com/img.jpg" width="640" height="480" alt="test">';
    const result = fixImageDimensions(html);
    expect(result).not.toContain('width=');
    expect(result).not.toContain('height=');
    expect(result).toContain('src=');
  });

  test('相対パスを絶対 URL に変換する', () => {
    const html = '<img src="/images/photo.jpg" alt="写真">';
    const result = fixImageDimensions(html, 'https://example.com/blog/article');
    expect(result).toContain('src="https://example.com/images/photo.jpg"');
  });

  test('./相対パスも絶対 URL に変換する', () => {
    const html = '<img src="./img/icon.png">';
    const result = fixImageDimensions(html, 'https://example.com/blog/article');
    expect(result).toContain('src="https://example.com/blog/img/icon.png"');
  });

  test('https:// で始まる URL はそのまま保持する', () => {
    const html = '<img src="https://cdn.example.com/img.jpg">';
    const result = fixImageDimensions(html, 'https://other.com/');
    expect(result).toContain('src="https://cdn.example.com/img.jpg"');
  });

  test('pageUrl なしでは相対パスを変換しない', () => {
    const html = '<img src="/images/photo.jpg">';
    const result = fixImageDimensions(html);
    expect(result).toContain('src="/images/photo.jpg"');
  });

  test('loading="lazy" を自動追加する', () => {
    const html = '<img src="https://example.com/img.jpg">';
    const result = fixImageDimensions(html);
    expect(result).toContain('loading="lazy"');
  });

  test('既存の loading 属性は上書きしない', () => {
    const html = '<img src="https://example.com/img.jpg" loading="eager">';
    const result = fixImageDimensions(html);
    expect(result).toContain('loading="eager"');
    expect(result).not.toContain('loading="lazy"');
  });

});

test.describe('transformZennMermaidEmbeds — Zenn mermaid 変換', () => {
  const ZENN_URL = 'https://zenn.dev/user/articles/example';
  const OTHER_URL = 'https://dev.classmethod.jp/articles/example';

  const makeMermaidSpan = (encodedContent: string) =>
    `<span class="embed-block zenn-embedded zenn-embedded-mermaid">` +
    `<iframe id="zenn-embedded__abc" src="https://embed.zenn.studio/mermaid#zenn-embedded__abc"` +
    ` data-content="${encodedContent}"></iframe></span>`;

  test('zenn.dev では mermaid embed が code ブロックに変換される', () => {
    const span = makeMermaidSpan('flowchart%20TD%0A%20%20A%5BStart%5D%20--%3E%20B%5BEnd%5D');
    const result = transformZennMermaidEmbeds(span, ZENN_URL);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('embed.zenn.studio');
    expect(result).toContain('language-mermaid');
    expect(result).toContain('flowchart TD');
    expect(result).toContain('A[Start]');
  });

  test('zenn.dev 以外のドメインでは変換されない（classmethod 等）', () => {
    const span = makeMermaidSpan('flowchart%20TD%0A%20%20A%5BStart%5D%20--%3E%20B%5BEnd%5D');
    const result = transformZennMermaidEmbeds(span, OTHER_URL);
    // 変換されずそのまま返る
    expect(result).toBe(span);
    expect(result).toContain('<iframe');
  });

  test('pageUrl 省略時は変換されない', () => {
    const span = makeMermaidSpan('flowchart%20TD%0A%20%20A%5BStart%5D%20--%3E%20B%5BEnd%5D');
    const result = transformZennMermaidEmbeds(span);
    expect(result).toBe(span);
  });

  test('< > & が HTML エスケープされる (zenn.dev)', () => {
    // mermaid source: A[a<b] --> B{c>d}
    const span = makeMermaidSpan('A%5Ba%3Cb%5D%20--%3E%20B%7Bc%3Ed%7D');
    const result = transformZennMermaidEmbeds(span, ZENN_URL);
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).not.toContain('<b');
  });

  test('data-content がない iframe はそのまま保持される', () => {
    const span =
      `<span class="embed-block zenn-embedded zenn-embedded-mermaid">` +
      `<iframe src="https://embed.zenn.studio/mermaid#id"></iframe></span>`;
    const result = transformZennMermaidEmbeds(span, ZENN_URL);
    expect(result).toContain('<iframe');
  });

  test('mermaid 以外の Zenn embed は変換されない', () => {
    const otherEmbed =
      `<span class="embed-block zenn-embedded zenn-embedded-tweet">` +
      `<iframe src="https://embed.zenn.studio/twitter/xxx"></iframe></span>`;
    const result = transformZennMermaidEmbeds(otherEmbed, ZENN_URL);
    expect(result).toContain('<iframe');
    expect(result).toContain('embed.zenn.studio/twitter');
  });

  test('mermaid embed を含まない通常テキストは変更されない', () => {
    const html = '<p>通常のテキスト</p><pre><code>コードブロック</code></pre>';
    expect(transformZennMermaidEmbeds(html, ZENN_URL)).toBe(html);
  });
});

// src/lib/content.ts の transformZennCardEmbeds と同一ロジック（複製）
function transformZennCardEmbeds(content: string): string {
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-card\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const dcMatch = spanMatch.match(/\bdata-content=["']([^"']+)["']/i);
      if (!dcMatch) return spanMatch;
      try {
        const url = decodeURIComponent(dcMatch[1]);
        return `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
      } catch {
        return spanMatch;
      }
    },
  );
}

// src/lib/content.ts の transformZennTweetEmbeds と同一ロジック（複製）
function transformZennTweetEmbeds(content: string): string {
  return content.replace(
    /<span\b[^>]*\bzenn-embedded-tweet\b[^>]*>[\s\S]*?<\/span>/gi,
    (spanMatch) => {
      const dcMatch = spanMatch.match(/\bdata-content=["']([^"']+)["']/i);
      if (!dcMatch) return spanMatch;
      try {
        const url = decodeURIComponent(dcMatch[1]);
        return `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
      } catch {
        return spanMatch;
      }
    },
  );
}

test.describe('transformZennCardEmbeds — Zenn card embed 変換', () => {
  const makeCardSpan = (encodedUrl: string) =>
    `<span class="embed-block zenn-embedded zenn-embedded-card">` +
    `<iframe id="zenn-embedded__xxx" src="https://embed.zenn.studio/card#zenn-embedded__xxx"` +
    ` data-content="${encodedUrl}" frameborder="0" scrolling="no" loading="lazy"></iframe></span>`;

  test('data-content から URL をデコードしてリンクに変換する', () => {
    const span = makeCardSpan('https%3A%2F%2Fdev.classmethod.jp%2Farticles%2Fexample%2F');
    const result = transformZennCardEmbeds(span);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('embed.zenn.studio');
    expect(result).toContain('<a href="https://dev.classmethod.jp/articles/example/"');
    expect(result).toContain('https://dev.classmethod.jp/articles/example/');
  });

  test('zenn.dev 内の card embed も変換される（スキップしない）', () => {
    const span = makeCardSpan('https%3A%2F%2Fzenn.dev%2Fknowledgework%2Farticles%2F0160b8d008d1e9');
    const result = transformZennCardEmbeds(span);
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<a href="https://zenn.dev/knowledgework/articles/0160b8d008d1e9"');
  });

  test('data-content がない span はそのまま保持される', () => {
    const span =
      `<span class="embed-block zenn-embedded zenn-embedded-card">` +
      `<iframe src="https://embed.zenn.studio/card#id"></iframe></span>`;
    const result = transformZennCardEmbeds(span);
    expect(result).toContain('<iframe');
  });

  test('card 以外の zenn embed (tweet) は変換されない', () => {
    const tweetSpan =
      `<span class="embed-block zenn-embedded zenn-embedded-tweet">` +
      `<iframe src="https://embed.zenn.studio/tweet#id" data-content="https%3A%2F%2Fx.com%2F123"></iframe></span>`;
    const result = transformZennCardEmbeds(tweetSpan);
    expect(result).toBe(tweetSpan);
    expect(result).toContain('<iframe');
  });

  test('card embed を含まない通常テキストは変更されない', () => {
    const html = '<p>通常のテキスト</p><a href="https://example.com">リンク</a>';
    expect(transformZennCardEmbeds(html)).toBe(html);
  });
});

test.describe('transformZennTweetEmbeds — Zenn tweet embed 変換', () => {
  const makeTweetSpan = (encodedUrl: string) =>
    `<span class="embed-block zenn-embedded zenn-embedded-tweet">` +
    `<iframe src="https://embed.zenn.studio/tweet#zenn-embedded__xxx"` +
    ` data-content="${encodedUrl}" frameborder="0" scrolling="no"></iframe></span>`;

  test('data-content から X/Twitter URL をデコードしてリンクに変換する', () => {
    const span = makeTweetSpan('https%3A%2F%2Fx.com%2Ftenntenn%2Fstatus%2F1808029094111858945%3Fs%3D20');
    const result = transformZennTweetEmbeds(span);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('embed.zenn.studio');
    expect(result).toContain('<a href="https://x.com/tenntenn/status/1808029094111858945?s=20"');
  });

  test('data-content がない span はそのまま保持される', () => {
    const span =
      `<span class="embed-block zenn-embedded zenn-embedded-tweet">` +
      `<iframe src="https://embed.zenn.studio/tweet#id"></iframe></span>`;
    const result = transformZennTweetEmbeds(span);
    expect(result).toContain('<iframe');
  });

  test('tweet 以外の zenn embed (card) は変換されない', () => {
    const cardSpan =
      `<span class="embed-block zenn-embedded zenn-embedded-card">` +
      `<iframe src="https://embed.zenn.studio/card#id" data-content="https%3A%2F%2Fexample.com"></iframe></span>`;
    const result = transformZennTweetEmbeds(cardSpan);
    expect(result).toBe(cardSpan);
  });

  test('tweet embed を含まない通常テキストは変更されない', () => {
    const html = '<p>通常のテキスト</p>';
    expect(transformZennTweetEmbeds(html)).toBe(html);
  });
});

test.describe('extractMainContent 回帰テスト', () => {
  test('article ネスト: 後半本文が切れない', () => {
    const html = '<html><body><article class="main"><h1>Title</h1><article class="inner">inner</article><p>後半の本文</p></article></body></html>';
    const result = extractArticle(html);
    expect(result).toContain('後半の本文');
  });

  test('Qiita itemprop: 複数段落がすべて取得される', () => {
    const html = '<html><body><div itemprop="articleBody"><p>段落1</p><p>段落2</p><p>段落3</p></div></body></html>';
    const result = extractArticle(html);
    expect(result).toContain('段落1');
    expect(result).toContain('段落2');
    expect(result).toContain('段落3');
  });

  test('Zenn znc: ネストした div 以降も取得される', () => {
    const html = '<html><body><div class="znc"><h2>見出し</h2><div class="code-block">コード</div><p>最後の段落</p></div></body></html>';
    const result = extractArticle(html);
    expect(result).toContain('見出し');
    expect(result).toContain('最後の段落');
  });

  test('main タグ: 全コンテンツが取得される', () => {
    const html = '<html><body><main><section><h2>セクション1</h2><p>本文1</p></section><section><h2>セクション2</h2><p>本文2</p></section></main></body></html>';
    const result = extractArticle(html);
    expect(result).toContain('セクション1');
    expect(result).toContain('セクション2');
    expect(result).toContain('本文2');
  });

  test('header/nav/footer は除去される', () => {
    const html = '<html><body><header>ナビ</header><main><p>本文</p></main><footer>フッター</footer></body></html>';
    const result = extractArticle(html);
    expect(result).toContain('本文');
    expect(result).not.toContain('ナビ');
    expect(result).not.toContain('フッター');
  });
});
