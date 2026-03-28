import { test, expect } from "@playwright/test";
import { sanitizeHtml } from "../src/lib/html";

/**
 * sanitizeHtml の回帰テスト
 *
 * XSS・インジェクション対策のサニタイズ関数が既知の攻撃ベクトルを
 * 正しく除去することを確認する。
 */

test.describe("sanitizeHtml — XSS 攻撃ベクトル", () => {
  test("<script> タグが除去される", () => {
    const result = sanitizeHtml("<p>本文</p><script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>本文</p>");
  });

  test("複数行 <script> が除去される", () => {
    const result = sanitizeHtml(
      '<p>本文</p><script type="text/javascript">\ndocument.cookie="x=1"\n</script>',
    );
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("document.cookie");
  });

  test("<style> タグが除去される", () => {
    const result = sanitizeHtml(
      "<p>本文</p><style>body{background:url(x)onerror=alert(1)}</style>",
    );
    expect(result).not.toContain("<style>");
    expect(result).toContain("<p>本文</p>");
  });

  test("<link> タグが除去される（React 19 リソースホイスティング防止）", () => {
    const result = sanitizeHtml('<link rel="stylesheet" href="https://evil.example/x.css">本文');
    expect(result).not.toContain("<link");
    expect(result).toContain("本文");
  });

  test("<base> タグが除去される（相対 URL ハイジャック防止）", () => {
    const result = sanitizeHtml('<base href="https://evil.example/">本文');
    expect(result).not.toContain("<base");
    expect(result).toContain("本文");
  });

  test("インラインイベントハンドラが除去される", () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
  });

  test("/ 区切りのイベントハンドラバイパスが除去される", () => {
    const result = sanitizeHtml('<img src="x"/onerror="alert(1)">');
    expect(result).not.toContain("onerror");
  });

  test("引用符直後のイベントハンドラが除去される（ダブルクォート）", () => {
    // <img src="x"onerror=...> のように閉じ引用符直後に on属性が来るバイパスを除去する
    const result = sanitizeHtml('<img src="x"onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
  });

  test("引用符直後のイベントハンドラが除去される（シングルクォート）", () => {
    // <img src='x'onerror=...> のようなシングルクォート版バイパスを除去する
    const result = sanitizeHtml("<img src='x'onerror='alert(1)'>");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
  });

  test("バックティック直後のイベントハンドラが除去される", () => {
    // <img src=`x`onerror=...> のようなバックティック版バイパスを除去する
    // ブラウザは属性値にバックティックを使った場合でも属性の区切りとして扱うことがある
    const result = sanitizeHtml("<img src=`x`onerror=alert(1)>");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
  });

  test("onclick ハンドラが除去される", () => {
    const result = sanitizeHtml('<a onclick="evil()">リンク</a>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("リンク");
  });
});

test.describe("sanitizeHtml — <iframe> 防止", () => {
  test("<iframe> タグが除去される", () => {
    const result = sanitizeHtml('<iframe src="https://evil.example/"></iframe>');
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("evil.example");
  });

  test("自己閉じ <iframe> が除去される", () => {
    const result = sanitizeHtml('<p>本文</p><iframe src="https://evil.example/" />');
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>本文</p>");
  });

  test("srcdoc 属性が除去される（iframe フォールバック防止）", () => {
    const result = sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
    expect(result).not.toContain("srcdoc");
    expect(result).not.toContain("<iframe");
  });
});

test.describe("sanitizeHtml — 信頼済み <iframe> の保持", () => {
  test("YouTube embed が保持される", () => {
    const iframe =
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>';
    const result = sanitizeHtml(`<p>動画</p>${iframe}`);
    expect(result).toContain("youtube.com/embed");
    expect(result).toContain("<iframe");
    expect(result).toContain("<p>動画</p>");
  });

  test("YouTube Privacy Enhanced (youtube-nocookie.com) が保持される", () => {
    const iframe = '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("youtube-nocookie.com/embed");
  });

  test("Vimeo embed が保持される", () => {
    const iframe = '<iframe src="https://player.vimeo.com/video/123456"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("player.vimeo.com");
  });

  test("Spotify embed が保持される", () => {
    const iframe = '<iframe src="https://open.spotify.com/embed/track/abc"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("open.spotify.com/embed");
  });

  test("SoundCloud embed が保持される", () => {
    const iframe = '<iframe src="https://w.soundcloud.com/player/?url=..."></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("w.soundcloud.com");
  });

  test("Twitch embed が保持される", () => {
    const iframe = '<iframe src="https://player.twitch.tv/?channel=test"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("player.twitch.tv");
  });

  test("NicoNico embed が保持される", () => {
    const iframe = '<iframe src="https://embed.nicovideo.jp/watch/sm9"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("embed.nicovideo.jp");
  });

  test("Zenn embed が保持される", () => {
    const iframe = '<iframe src="https://embed.zenn.studio/articles/xxx"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("embed.zenn.studio");
  });

  test("信頼済み src のない <iframe> (src 属性なし) が除去される", () => {
    const result = sanitizeHtml("<iframe></iframe>");
    expect(result).not.toContain("<iframe");
  });

  test("信頼済みドメインに似た偽ドメインが除去される（サブドメイン偽装）", () => {
    // youtube.com.evil.example/embed のような偽装は除去されること
    // isTrustedIframeSrc は hostname の完全一致で検証するため、このような偽装も確実に除去する
    const result = sanitizeHtml(
      '<iframe src="https://youtube.com.evil.example/embed/abc"></iframe>',
    );
    expect(result).not.toContain("evil.example");
    expect(result).not.toContain("<iframe");
  });

  test("パスに信頼済みドメインを含む偽 URL が除去される（パスインジェクション）", () => {
    // https://evil.com/youtube.com/embed/abc のような URL は
    // src.includes('youtube.com/embed') では通過してしまうが、
    // URL パース（isTrustedIframeSrc）では hostname = evil.com で却下される
    const result = sanitizeHtml('<iframe src="https://evil.com/youtube.com/embed/abc"></iframe>');
    expect(result).not.toContain("evil.com");
    expect(result).not.toContain("<iframe");
  });

  test("pathPrefix の部分一致でバイパスできない（/embed → /embedmalicious）", () => {
    // clips.twitch.tv の pathPrefix は "/embed"（末尾スラッシュなし）。
    // startsWith のみの検査では "/embedmalicious" が誤許可されてしまう。
    const result = sanitizeHtml('<iframe src="https://clips.twitch.tv/embedmalicious"></iframe>');
    expect(result).not.toContain("<iframe");
  });

  test("clips.twitch.tv の正規パス（/embed/...）は保持される", () => {
    const iframe = '<iframe src="https://clips.twitch.tv/embed/clip1"></iframe>';
    const result = sanitizeHtml(iframe);
    expect(result).toContain("clips.twitch.tv");
    expect(result).toContain("<iframe");
  });
});

test.describe("sanitizeHtml — 危険スキーム防止", () => {
  test("javascript: href が除去される（クォートあり）", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">リンク</a>');
    expect(result).not.toContain("javascript:");
    expect(result).toContain("リンク");
  });

  test("javascript: src が除去される（クォートなし）", () => {
    const result = sanitizeHtml("<img src=javascript:alert(1)>");
    expect(result).not.toContain("javascript:");
  });

  test("vbscript: href が除去される", () => {
    const result = sanitizeHtml('<a href="vbscript:MsgBox(1)">リンク</a>');
    expect(result).not.toContain("vbscript:");
    expect(result).toContain("リンク");
  });

  test("formaction 属性の javascript: が除去される", () => {
    const result = sanitizeHtml(
      '<form><button formaction="javascript:alert(1)">送信</button></form>',
    );
    expect(result).not.toContain("javascript:");
    expect(result).toContain("送信");
  });

  test("data: URI の src が除去される（クォートあり）", () => {
    const result = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain("data:");
  });

  test("data: URI の href が除去される（クォートなし）", () => {
    const result = sanitizeHtml("<a href=data:text/html,XSS>リンク</a>");
    expect(result).not.toContain("data:");
  });
});

test.describe("sanitizeHtml — HTML エンティティ・空白バイパス防止", () => {
  test("十進エンティティで先頭文字をエンコードした javascript: が除去される（&#106; = j）", () => {
    // ブラウザは href 属性値の &# エンティティをデコードするため、
    // &#106;avascript: は javascript: と等価になり XSS が成立する
    const result = sanitizeHtml('<a href="&#106;avascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("&#106;");
    expect(result).toContain("click");
  });

  test("十六進エンティティで先頭文字をエンコードした javascript: が除去される（&#x6A; = j）", () => {
    const result = sanitizeHtml('<a href="&#x6A;avascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("&#x6A;");
    expect(result).toContain("click");
  });

  test("エンティティエンコードされた data: URI が除去される（&#100; = d）", () => {
    const result = sanitizeHtml('<img src="&#100;ata:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain("data:");
    expect(result).not.toContain("&#100;");
  });

  test("先頭スペースがある javascript: href が除去される", () => {
    // ブラウザは href 属性値の先頭空白を無視するため " javascript:" は "javascript:" と同等
    const result = sanitizeHtml('<a href=" javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  test("先頭改行がある javascript: href が除去される", () => {
    const result = sanitizeHtml('<a href="\njavascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  test("通常の https: URL はエンティティチェックで除去されない", () => {
    const result = sanitizeHtml('<a href="https://example.com">リンク</a>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("リンク");
  });
});

test.describe("sanitizeHtml — その他の攻撃ベクトル", () => {
  test('<meta http-equiv="refresh"> が除去される', () => {
    const result = sanitizeHtml(
      '<meta http-equiv="refresh" content="0;url=https://evil.example/"><p>本文</p>',
    );
    expect(result).not.toContain("http-equiv");
    expect(result).not.toContain("evil.example");
    expect(result).toContain("<p>本文</p>");
  });

  test("<object> タグが除去される", () => {
    const result = sanitizeHtml(
      '<object data="https://evil.example/flash.swf"><p>本文</p></object>',
    );
    expect(result).not.toContain("<object");
    expect(result).not.toContain("flash.swf");
  });

  test("<embed> タグが除去される", () => {
    const result = sanitizeHtml('<embed src="https://evil.example/plugin" /><p>本文</p>');
    expect(result).not.toContain("<embed");
    expect(result).toContain("<p>本文</p>");
  });

  test("ping 属性が除去される（リンククリック時の意図しないリクエスト防止）", () => {
    const result = sanitizeHtml(
      '<a href="https://example.com" ping="https://tracker.example/">テキスト</a>',
    );
    expect(result).not.toContain("ping=");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("テキスト");
  });

  test("SVG 内の <script> が除去される", () => {
    const result = sanitizeHtml("<svg><script>alert(1)</script></svg>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert(1)");
  });

  test("SVG xlink:href の javascript: が除去される（<a> 要素）", () => {
    const result = sanitizeHtml(
      '<svg><a xlink:href="javascript:alert(1)"><text>click</text></a></svg>',
    );
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("xlink:");
    expect(result).toContain("click");
  });

  test("SVG xlink:href の javascript: が除去される（<image> 要素）", () => {
    const result = sanitizeHtml('<svg><image xlink:href="javascript:alert(1)"/></svg>');
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("xlink:");
  });

  test("SVG xlink:href の data: URI が除去される（<use> 要素）", () => {
    const result = sanitizeHtml(
      '<svg><use xlink:href="data:image/svg+xml,<svg><script>alert(1)</script></svg>"/></svg>',
    );
    expect(result).not.toContain("data:");
    expect(result).not.toContain("xlink:");
  });

  test("SVG xlink:href のエンティティエンコードされた javascript: が除去される", () => {
    const result = sanitizeHtml(
      '<svg><a xlink:href="&#106;avascript:alert(1)"><text>click</text></a></svg>',
    );
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("xlink:");
    expect(result).toContain("click");
  });

  test("SVG xlink:href の安全な https: URL は保持される", () => {
    const result = sanitizeHtml('<svg><image xlink:href="https://example.com/image.png"/></svg>');
    expect(result).toContain('xlink:href="https://example.com/image.png"');
  });

  test("SVG <foreignObject> が除去される（HTML 埋め込み防止）", () => {
    const result = sanitizeHtml(
      "<svg><foreignObject><div><script>alert(1)</script></div></foreignObject></svg>",
    );
    expect(result).not.toContain("<foreignObject");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert(1)");
  });

  test("SVG <foreignObject> 自己閉じが除去される", () => {
    const result = sanitizeHtml('<svg><foreignObject width="100%" height="100%"/></svg>');
    expect(result).not.toContain("<foreignObject");
  });
});

test.describe("sanitizeHtml — <noscript> / <template> 除去", () => {
  test("<noscript> タグとその内容が除去される", () => {
    const result = sanitizeHtml('<p>本文</p><noscript><img src="x" onerror="alert(1)"></noscript>');
    expect(result).not.toContain("<noscript");
    expect(result).not.toContain("onerror");
    expect(result).toContain("<p>本文</p>");
  });

  test("<noscript> 内のスクリプトが除去される", () => {
    const result = sanitizeHtml(
      '<noscript><script>document.cookie="x=1"</script></noscript><p>本文</p>',
    );
    expect(result).not.toContain("<noscript");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("document.cookie");
    expect(result).toContain("<p>本文</p>");
  });

  test("<template> タグとその内容が除去される", () => {
    const result = sanitizeHtml(
      "<p>本文</p><template><div><script>alert(1)</script></div></template>",
    );
    expect(result).not.toContain("<template");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>本文</p>");
  });

  test("複数行 <noscript> が除去される", () => {
    const result = sanitizeHtml(
      "<p>前</p>\n<noscript>\n  <p>フォールバック</p>\n</noscript>\n<p>後</p>",
    );
    expect(result).not.toContain("<noscript");
    expect(result).not.toContain("フォールバック");
    expect(result).toContain("<p>前</p>");
    expect(result).toContain("<p>後</p>");
  });
});

test.describe("sanitizeHtml — inline style サニタイズ", () => {
  test("style 属性内の url() が除去される（CSS トラッキングピクセル防止）", () => {
    const result = sanitizeHtml(
      '<p style="background-image:url(https://tracker.example/pixel.gif)">本文</p>',
    );
    expect(result).not.toContain("url(");
    expect(result).not.toContain("tracker.example");
    expect(result).toContain('<p style="');
    expect(result).toContain("本文</p>");
  });

  test("style 属性内の background url() が除去される（外部リソース読み込み防止）", () => {
    const result = sanitizeHtml(
      "<div style=\"background: url('https://evil.example/bg.png') no-repeat\">内容</div>",
    );
    expect(result).not.toContain("url(");
    expect(result).not.toContain("evil.example");
    expect(result).toContain("内容</div>");
  });

  test("position: fixed が除去される（フィッシングオーバーレイ防止）", () => {
    const result = sanitizeHtml(
      '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:9999">偽UI</div>',
    );
    expect(result).not.toMatch(/position\s*:\s*fixed/i);
    expect(result).toContain("偽UI</div>");
  });

  test("position: sticky が除去される", () => {
    const result = sanitizeHtml(
      '<div style="position:sticky;top:0;background:white">ヘッダー</div>',
    );
    expect(result).not.toMatch(/position\s*:\s*sticky/i);
    expect(result).toContain("ヘッダー</div>");
  });

  test("シングルクォートの style 属性内の url() が除去される", () => {
    const result = sanitizeHtml("<p style='background:url(https://evil.example/x.gif)'>本文</p>");
    expect(result).not.toContain("url(");
    expect(result).not.toContain("evil.example");
    expect(result).toContain("本文</p>");
  });

  test("無害な style 属性（color, font-size, text-align 等）は保持される", () => {
    const result = sanitizeHtml('<p style="color:red;font-size:16px;text-align:center">本文</p>');
    expect(result).toContain("color:red");
    expect(result).toContain("font-size:16px");
    expect(result).toContain("text-align:center");
    expect(result).toContain("本文</p>");
  });

  test("position: relative は保持される（固定・絶対配置でないため）", () => {
    const result = sanitizeHtml('<div style="position:relative;top:10px">内容</div>');
    expect(result).toContain("position:relative");
    expect(result).toContain("内容</div>");
  });
});

test.describe("sanitizeHtml — SVG アニメーション要素によるインジェクション防止", () => {
  test("<animate> 要素が除去される", () => {
    const result = sanitizeHtml(
      '<svg><a><animate attributeName="href" to="javascript:alert(1)"/>クリック</a></svg>',
    );
    expect(result).not.toContain("<animate");
    expect(result).not.toContain("javascript:");
    expect(result).toContain("クリック");
  });

  test("<animate> によるイベントハンドラ注入が除去される", () => {
    const result = sanitizeHtml(
      '<svg><circle r="10"><animate attributeName="onmouseover" values="alert(1)"/></circle></svg>',
    );
    expect(result).not.toContain("<animate");
    expect(result).not.toContain("onmouseover");
  });

  test("<animateTransform> 要素が除去される", () => {
    const result = sanitizeHtml(
      '<svg><rect><animateTransform attributeName="onclick" type="rotate" values="alert(1)"/></rect></svg>',
    );
    expect(result).not.toContain("<animateTransform");
    expect(result).not.toContain("onclick");
  });

  test("<set> 要素が除去される", () => {
    const result = sanitizeHtml(
      '<svg><a><set attributeName="href" to="javascript:alert(1)"/>テキスト</a></svg>',
    );
    expect(result).not.toContain("<set");
    expect(result).not.toContain("javascript:");
    expect(result).toContain("テキスト");
  });

  test("<animateMotion> 要素が除去される", () => {
    const result = sanitizeHtml(
      '<svg><circle><animateMotion dur="10s" repeatCount="indefinite"><mpath href="#path"/></animateMotion></circle></svg>',
    );
    expect(result).not.toContain("<animateMotion");
  });

  test("SVG <use> の外部参照が除去される（HTTP URL）", () => {
    const result = sanitizeHtml('<svg><use href="https://attacker.com/evil.svg#xss"></use></svg>');
    expect(result).not.toContain("<use");
    expect(result).not.toContain("attacker.com");
  });

  test("SVG <use> の外部参照が除去される（xlink:href）", () => {
    const result = sanitizeHtml(
      '<svg><use xlink:href="https://attacker.com/evil.svg#xss"></use></svg>',
    );
    expect(result).not.toContain("<use");
    expect(result).not.toContain("attacker.com");
  });

  test("SVG <use> の空 href が除去される", () => {
    const result = sanitizeHtml('<svg><use href=""></use></svg>');
    expect(result).not.toContain("<use");
  });

  test("SVG <use> の同一ドキュメント内フラグメント参照は保持される", () => {
    const result = sanitizeHtml(
      '<svg><defs><circle id="c" r="10"/></defs><use href="#c"></use></svg>',
    );
    expect(result).toContain('<use href="#c">');
    // 閉じタグも保持されること（フラグメント参照は要素ごと許可）
    expect(result).toContain("</use>");
  });

  test("SVG <use> 外部参照のフォールバックコンテンツが除去される", () => {
    // 外部参照の <use href="external">fallback</use> はフォールバック内容ごと除去
    // 旧実装では "fallback" テキストが露出していた
    const result = sanitizeHtml(
      '<svg><use href="https://attacker.com/evil.svg#icon">フォールバック</use></svg>',
    );
    expect(result).not.toContain("<use");
    expect(result).not.toContain("attacker.com");
    expect(result).not.toContain("フォールバック");
  });

  test("SVG <use> 外部参照（xlink:href）のフォールバックコンテンツが除去される", () => {
    const result = sanitizeHtml(
      '<svg><use xlink:href="https://attacker.com/sprite.svg#icon"><title>代替テキスト</title></use></svg>',
    );
    expect(result).not.toContain("<use");
    expect(result).not.toContain("attacker.com");
    expect(result).not.toContain("代替テキスト");
  });

  test("SVG <use> 自己閉じタグ（フラグメント参照）は保持される", () => {
    const result = sanitizeHtml('<svg><use href="#icon"/></svg>');
    expect(result).toContain('<use href="#icon"');
  });

  test("SVG <use> href が %23 (URL エンコードされた #) で始まるフラグメント参照は保持される", () => {
    // ブラウザは %23icon を #icon にデコードして同一ドキュメント参照として扱う
    const result = sanitizeHtml('<svg><use href="%23icon"></use></svg>');
    expect(result).toContain('<use href="%23icon">');
  });

  test("SVG <use> href が %23 + パス区切りを含む場合でもフラグメント参照として保持される", () => {
    // %23/../evil.svg は decoded すると #/../evil.svg — # で始まるため保持
    // ブラウザはこれをフラグメント識別子として扱い、外部リソースを読み込まない
    const result = sanitizeHtml('<svg><use href="%23/../local-id"></use></svg>');
    expect(result).toContain('<use href="%23/../local-id">');
  });

  test("SVG <use> href に不正な URL エンコード（単独 %）が含まれても除去されず保持 or 除去どちらでもクラッシュしない", () => {
    // decodeURIComponent が例外を投げる入力 — クラッシュせずに処理されること
    expect(() => sanitizeHtml('<svg><use href="%zz"></use></svg>')).not.toThrow();
  });
});

test.describe("sanitizeHtml — ReDoS 耐性", () => {
  // [\s\S]*? (非貪欲) を使うことで、閉じタグが見つからない場合でも
  // O(n) の線形スキャンで完了し、exponential backtracking が発生しない。
  // 旧パターン [^<]*(?:(?!<\/tag>)<[^<]*)* は 未閉じタグ × 大量の < 文字で
  // O(n²) のバックトラッキングが発生する可能性があった。

  test("<script> タグに < を大量に含む入力でタイムアウトしない（未閉じタグ）", () => {
    // </script> がない: 除去はされないが1秒以内に完了すること
    const input = "<p>前</p><script>" + "<x>".repeat(3000) + "alert(1)<p>後</p>";
    const start = Date.now();
    sanitizeHtml(input);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  test("<style> タグに < を大量に含む入力でタイムアウトしない（未閉じタグ）", () => {
    const input = "<p>前</p><style>" + "<x>".repeat(3000) + "body{color:red}<p>後</p>";
    const start = Date.now();
    sanitizeHtml(input);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  test("<noscript> タグに < を大量に含む入力でタイムアウトしない（未閉じタグ）", () => {
    const input = "<p>前</p><noscript>" + "<x>".repeat(3000) + '<img src="x"><p>後</p>';
    const start = Date.now();
    sanitizeHtml(input);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  test("正常に閉じた大きな <script> ブロックが除去される", () => {
    // 正しく閉じられた大量コンテンツでも正常に除去されること
    const content = "var x = 1;\n".repeat(1000);
    const input = `<p>前</p><script type="text/javascript">${content}</script><p>後</p>`;
    const start = Date.now();
    const result = sanitizeHtml(input);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("var x = 1");
    expect(result).toContain("<p>前</p>");
    expect(result).toContain("<p>後</p>");
  });
});

test.describe("sanitizeHtml — 正常コンテンツの保持", () => {
  test("通常の段落・リンク・画像が保持される", () => {
    const html =
      '<h1>タイトル</h1><p>本文 <a href="https://example.com">リンク</a></p>' +
      '<img src="https://example.com/image.png" alt="画像">';
    const result = sanitizeHtml(html);
    expect(result).toContain("<h1>タイトル</h1>");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('src="https://example.com/image.png"');
  });

  test("コードブロックが保持される", () => {
    const html = "<pre><code>const x = 1;\nconsole.log(x);</code></pre>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<pre><code>");
    expect(result).toContain("console.log(x)");
  });

  test("テーブルが保持される", () => {
    const html = "<table><tr><td>セル1</td><td>セル2</td></tr></table>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<table>");
    expect(result).toContain("セル1");
  });

  test("空文字列が正常に処理される", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});
