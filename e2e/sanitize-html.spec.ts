import { test, expect } from '@playwright/test';

/**
 * sanitizeHtml の回帰テスト
 *
 * XSS・インジェクション対策のサニタイズ関数が既知の攻撃ベクトルを
 * 正しく除去することを確認する。
 *
 * テスト内に同一ロジックを複製して、サーバー起動なし・認証なしで実行できるようにしている。
 */

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<base\b[^>]*\/?>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe\b[^>]*\/>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*\/?>/gi, '')
    .replace(/[\s/]+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(
      /(?:href|src|action|formaction)\s*=\s*["'](?:javascript|vbscript):[^"']*["']/gi,
      ''
    )
    .replace(
      /(?:href|src|action|formaction)\s*=\s*(?:javascript|vbscript):[^\s>]*/gi,
      ''
    )
    .replace(/(?:src|href|action|formaction)\s*=\s*["']data:[^"']*["']/gi, '')
    .replace(/(?:src|href|action|formaction)\s*=\s*data:[^\s>]*/gi, '')
    .replace(/\bsrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/\bping\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .trim();
}

test.describe('sanitizeHtml — XSS 攻撃ベクトル', () => {
  test('<script> タグが除去される', () => {
    const result = sanitizeHtml('<p>本文</p><script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('<p>本文</p>');
  });

  test('複数行 <script> が除去される', () => {
    const result = sanitizeHtml(
      '<p>本文</p><script type="text/javascript">\ndocument.cookie="x=1"\n</script>'
    );
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('document.cookie');
  });

  test('<style> タグが除去される', () => {
    const result = sanitizeHtml('<p>本文</p><style>body{background:url(x)onerror=alert(1)}</style>');
    expect(result).not.toContain('<style>');
    expect(result).toContain('<p>本文</p>');
  });

  test('<base> タグが除去される（相対 URL ハイジャック防止）', () => {
    const result = sanitizeHtml('<base href="https://evil.example/">本文');
    expect(result).not.toContain('<base');
    expect(result).toContain('本文');
  });

  test('インラインイベントハンドラが除去される', () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
  });

  test('/ 区切りのイベントハンドラバイパスが除去される', () => {
    const result = sanitizeHtml('<img src="x"/onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  test('onclick ハンドラが除去される', () => {
    const result = sanitizeHtml('<a onclick="evil()">リンク</a>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('リンク');
  });
});

test.describe('sanitizeHtml — <iframe> 防止', () => {
  test('<iframe> タグが除去される', () => {
    const result = sanitizeHtml('<iframe src="https://evil.example/"></iframe>');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('evil.example');
  });

  test('自己閉じ <iframe> が除去される', () => {
    const result = sanitizeHtml('<p>本文</p><iframe src="https://evil.example/" />');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<p>本文</p>');
  });

  test('srcdoc 属性が除去される（iframe フォールバック防止）', () => {
    const result = sanitizeHtml(
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>'
    );
    expect(result).not.toContain('srcdoc');
    expect(result).not.toContain('<iframe');
  });
});

test.describe('sanitizeHtml — 危険スキーム防止', () => {
  test('javascript: href が除去される（クォートあり）', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">リンク</a>');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('リンク');
  });

  test('javascript: src が除去される（クォートなし）', () => {
    const result = sanitizeHtml('<img src=javascript:alert(1)>');
    expect(result).not.toContain('javascript:');
  });

  test('vbscript: href が除去される', () => {
    const result = sanitizeHtml('<a href="vbscript:MsgBox(1)">リンク</a>');
    expect(result).not.toContain('vbscript:');
    expect(result).toContain('リンク');
  });

  test('formaction 属性の javascript: が除去される', () => {
    const result = sanitizeHtml(
      '<form><button formaction="javascript:alert(1)">送信</button></form>'
    );
    expect(result).not.toContain('javascript:');
    expect(result).toContain('送信');
  });

  test('data: URI の src が除去される（クォートあり）', () => {
    const result = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain('data:');
  });

  test('data: URI の href が除去される（クォートなし）', () => {
    const result = sanitizeHtml('<a href=data:text/html,XSS>リンク</a>');
    expect(result).not.toContain('data:');
  });
});

test.describe('sanitizeHtml — その他の攻撃ベクトル', () => {
  test('<meta http-equiv="refresh"> が除去される', () => {
    const result = sanitizeHtml(
      '<meta http-equiv="refresh" content="0;url=https://evil.example/"><p>本文</p>'
    );
    expect(result).not.toContain('http-equiv');
    expect(result).not.toContain('evil.example');
    expect(result).toContain('<p>本文</p>');
  });

  test('<object> タグが除去される', () => {
    const result = sanitizeHtml(
      '<object data="https://evil.example/flash.swf"><p>本文</p></object>'
    );
    expect(result).not.toContain('<object');
    expect(result).not.toContain('flash.swf');
  });

  test('<embed> タグが除去される', () => {
    const result = sanitizeHtml('<embed src="https://evil.example/plugin" /><p>本文</p>');
    expect(result).not.toContain('<embed');
    expect(result).toContain('<p>本文</p>');
  });

  test('ping 属性が除去される（リンククリック時の意図しないリクエスト防止）', () => {
    const result = sanitizeHtml('<a href="https://example.com" ping="https://tracker.example/">テキスト</a>');
    expect(result).not.toContain('ping=');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('テキスト');
  });

  test('SVG 内の <script> が除去される', () => {
    const result = sanitizeHtml('<svg><script>alert(1)</script></svg>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
  });
});

test.describe('sanitizeHtml — 正常コンテンツの保持', () => {
  test('通常の段落・リンク・画像が保持される', () => {
    const html =
      '<h1>タイトル</h1><p>本文 <a href="https://example.com">リンク</a></p>' +
      '<img src="https://example.com/image.png" alt="画像">';
    const result = sanitizeHtml(html);
    expect(result).toContain('<h1>タイトル</h1>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('src="https://example.com/image.png"');
  });

  test('コードブロックが保持される', () => {
    const html = '<pre><code>const x = 1;\nconsole.log(x);</code></pre>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<pre><code>');
    expect(result).toContain('console.log(x)');
  });

  test('テーブルが保持される', () => {
    const html = '<table><tr><td>セル1</td><td>セル2</td></tr></table>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<table>');
    expect(result).toContain('セル1');
  });

  test('空文字列が正常に処理される', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});
