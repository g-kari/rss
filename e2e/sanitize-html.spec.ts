import { test, expect } from '@playwright/test';
import { sanitizeHtml } from '../src/lib/html';

/**
 * sanitizeHtml の回帰テスト
 *
 * XSS・インジェクション対策のサニタイズ関数が既知の攻撃ベクトルを
 * 正しく除去することを確認する。
 */

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

  test('<link> タグが除去される（React 19 リソースホイスティング防止）', () => {
    const result = sanitizeHtml('<link rel="stylesheet" href="https://evil.example/x.css">本文');
    expect(result).not.toContain('<link');
    expect(result).toContain('本文');
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

  test('引用符直後のイベントハンドラが除去される（ダブルクォート）', () => {
    // <img src="x"onerror=...> のように閉じ引用符直後に on属性が来るバイパスを除去する
    const result = sanitizeHtml('<img src="x"onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
  });

  test('引用符直後のイベントハンドラが除去される（シングルクォート）', () => {
    // <img src='x'onerror=...> のようなシングルクォート版バイパスを除去する
    const result = sanitizeHtml("<img src='x'onerror='alert(1)'>");
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
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

test.describe('sanitizeHtml — 信頼済み <iframe> の保持', () => {
  test('YouTube embed が保持される', () => {
    const iframe = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>';
    const result = sanitizeHtml(`<p>動画</p>${iframe}`);
    expect(result).toContain('youtube.com/embed');
    expect(result).toContain('<iframe');
    expect(result).toContain('<p>動画</p>');
  });

  test('YouTube Privacy Enhanced (youtube-nocookie.com) が保持される', () => {
    const iframe = '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain('youtube-nocookie.com/embed');
  });

  test('Vimeo embed が保持される', () => {
    const iframe = '<iframe src="https://player.vimeo.com/video/123456"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain('player.vimeo.com');
  });

  test('Spotify embed が保持される', () => {
    const iframe = '<iframe src="https://open.spotify.com/embed/track/abc"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain('open.spotify.com/embed');
  });

  test('SoundCloud embed が保持される', () => {
    const iframe = '<iframe src="https://w.soundcloud.com/player/?url=..."></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain('w.soundcloud.com');
  });

  test('Twitch embed が保持される', () => {
    const iframe = '<iframe src="https://player.twitch.tv/?channel=test"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain('player.twitch.tv');
  });

  test('NicoNico embed が保持される', () => {
    const iframe = '<iframe src="https://embed.nicovideo.jp/watch/sm9"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain('embed.nicovideo.jp');
  });

  test('Zenn embed が保持される', () => {
    const iframe = '<iframe src="https://embed.zenn.studio/articles/xxx"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain('embed.zenn.studio');
  });

  test('信頼済み src のない <iframe> (src 属性なし) が除去される', () => {
    const result = sanitizeHtml('<iframe></iframe>');
    expect(result).not.toContain('<iframe');
  });

  test('信頼済みドメインに似た偽ドメインが除去される（サブドメイン偽装）', () => {
    // youtube.com.evil.example/embed のような偽装は除去されること
    // isTrustedIframeSrc は hostname の完全一致で検証するため、このような偽装も確実に除去する
    const result = sanitizeHtml(
      '<iframe src="https://youtube.com.evil.example/embed/abc"></iframe>'
    );
    expect(result).not.toContain('evil.example');
    expect(result).not.toContain('<iframe');
  });

  test('パスに信頼済みドメインを含む偽 URL が除去される（パスインジェクション）', () => {
    // https://evil.com/youtube.com/embed/abc のような URL は
    // src.includes('youtube.com/embed') では通過してしまうが、
    // URL パース（isTrustedIframeSrc）では hostname = evil.com で却下される
    const result = sanitizeHtml(
      '<iframe src="https://evil.com/youtube.com/embed/abc"></iframe>'
    );
    expect(result).not.toContain('evil.com');
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

test.describe('sanitizeHtml — HTML エンティティ・空白バイパス防止', () => {
  test('十進エンティティで先頭文字をエンコードした javascript: が除去される（&#106; = j）', () => {
    // ブラウザは href 属性値の &# エンティティをデコードするため、
    // &#106;avascript: は javascript: と等価になり XSS が成立する
    const result = sanitizeHtml('<a href="&#106;avascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('&#106;');
    expect(result).toContain('click');
  });

  test('十六進エンティティで先頭文字をエンコードした javascript: が除去される（&#x6A; = j）', () => {
    const result = sanitizeHtml('<a href="&#x6A;avascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('&#x6A;');
    expect(result).toContain('click');
  });

  test('エンティティエンコードされた data: URI が除去される（&#100; = d）', () => {
    const result = sanitizeHtml('<img src="&#100;ata:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain('data:');
    expect(result).not.toContain('&#100;');
  });

  test('先頭スペースがある javascript: href が除去される', () => {
    // ブラウザは href 属性値の先頭空白を無視するため " javascript:" は "javascript:" と同等
    const result = sanitizeHtml('<a href=" javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('click');
  });

  test('先頭改行がある javascript: href が除去される', () => {
    const result = sanitizeHtml('<a href="\njavascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('click');
  });

  test('通常の https: URL はエンティティチェックで除去されない', () => {
    const result = sanitizeHtml('<a href="https://example.com">リンク</a>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('リンク');
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

test.describe('sanitizeHtml — inline style サニタイズ', () => {
  test('style 属性内の url() が除去される（CSS トラッキングピクセル防止）', () => {
    const result = sanitizeHtml(
      '<p style="background-image:url(https://tracker.example/pixel.gif)">本文</p>'
    );
    expect(result).not.toContain('url(');
    expect(result).not.toContain('tracker.example');
    expect(result).toContain('<p style="');
    expect(result).toContain('本文</p>');
  });

  test('style 属性内の background url() が除去される（外部リソース読み込み防止）', () => {
    const result = sanitizeHtml(
      '<div style="background: url(\'https://evil.example/bg.png\') no-repeat">内容</div>'
    );
    expect(result).not.toContain('url(');
    expect(result).not.toContain('evil.example');
    expect(result).toContain('内容</div>');
  });

  test('position: fixed が除去される（フィッシングオーバーレイ防止）', () => {
    const result = sanitizeHtml(
      '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:9999">偽UI</div>'
    );
    expect(result).not.toMatch(/position\s*:\s*fixed/i);
    expect(result).toContain('偽UI</div>');
  });

  test('position: sticky が除去される', () => {
    const result = sanitizeHtml(
      '<div style="position:sticky;top:0;background:white">ヘッダー</div>'
    );
    expect(result).not.toMatch(/position\s*:\s*sticky/i);
    expect(result).toContain('ヘッダー</div>');
  });

  test('シングルクォートの style 属性内の url() が除去される', () => {
    const result = sanitizeHtml(
      "<p style='background:url(https://evil.example/x.gif)'>本文</p>"
    );
    expect(result).not.toContain('url(');
    expect(result).not.toContain('evil.example');
    expect(result).toContain('本文</p>');
  });

  test('無害な style 属性（color, font-size, text-align 等）は保持される', () => {
    const result = sanitizeHtml(
      '<p style="color:red;font-size:16px;text-align:center">本文</p>'
    );
    expect(result).toContain('color:red');
    expect(result).toContain('font-size:16px');
    expect(result).toContain('text-align:center');
    expect(result).toContain('本文</p>');
  });

  test('position: relative は保持される（固定・絶対配置でないため）', () => {
    const result = sanitizeHtml(
      '<div style="position:relative;top:10px">内容</div>'
    );
    expect(result).toContain('position:relative');
    expect(result).toContain('内容</div>');
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
