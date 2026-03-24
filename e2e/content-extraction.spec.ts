import { test, expect } from '@playwright/test';

/**
 * extractMainContent のロジックを node スクリプトで検証する。
 * サーバー不要・認証不要で実行できる純粋なロジックテスト。
 *
 * 全文取得の正規表現バグ（non-greedy で途中切れ）が再発しないよう
 * 修正後のパターンを回帰テストとして定義する。
 */

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
