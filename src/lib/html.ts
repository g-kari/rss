/**
 * HTML サニタイズユーティリティ
 *
 * XSS・インジェクション対策のための正規表現ベースのサニタイズ関数。
 * RSS フィードの content と外部ページ取得の両方で共有する。
 */

/** HTML 特殊文字をエスケープする（テキストを属性値・要素内容として安全に埋め込む） */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** HTML エンティティをデコードする（URL 中の &amp; → & など） */
export function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/gi, (_m, d) => {
      const code = Number(d);
      // 制御文字（0–31, 127）は除去して空文字を返す（NUL/BEL等のインジェクション防止）
      return code > 31 && code !== 127 ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => {
      const code = parseInt(h, 16);
      return code > 31 && code !== 127 ? String.fromCharCode(code) : '';
    })
    // ゼロ幅文字・C1制御文字・BOM を除去（URL スキームバイパス防止）
    // 例: "&#x200b;javascript:" → ゼロ幅文字除去後も href バリデーションを確実に通す
    .replace(/[\u0080-\u009F\u00AD\u200B-\u200D\u2028\u2029\uFEFF]/g, '');
}

/**
 * URL 属性値が危険なスキームを含むかどうかを判定する。
 * HTML エンティティデコードと制御文字除去後に javascript: / vbscript: / data: を検出する。
 * ブラウザは属性値の HTML エンティティをデコードし空白・制御文字を無視するため、
 * 例: href="&#106;avascript:..." → &#106; = 'j' → javascript: に化けることがある。
 *
 * 制御文字は先頭だけでなく全体から除去する。
 * ブラウザが javascript\x00: のようにスキーム名中に埋め込まれた制御文字を無視する場合に
 * 先頭のみ除去では検出できないため、文字列全体から除去して判定する。
 */
function hasDangerousScheme(val: string): boolean {
  const decoded = unescapeHtml(val).replace(/[\u0000-\u0020\u007F]/g, '');
  return /^(?:javascript|vbscript|data):/i.test(decoded);
}

/** HTML タグを除去してプレーンテキストに変換する（AI 入力用） */
export function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * inline style 属性から危険な CSS プロパティを除去する。
 *
 * - url() 参照を除去: 外部リソース読み込みおよび CSS ベーストラッキング（閲覧行動の漏洩）を防ぐ
 *   例: background-image:url(https://tracker.example/pixel.gif) でピクセルトラッキングが可能
 * - position: fixed / sticky を除去: UI 全体を覆うフィッシングオーバーレイを防ぐ
 */
function sanitizeStyleAttr(style: string): string {
  return style
    .replace(/\burl\s*\([^)]*\)/gi, '')
    .replace(/\bposition\s*:\s*(fixed|sticky)\b[^;]*(;|$)/gi, '');
}

/**
 * iframe の src が信頼済みドメインかどうかを URL パースで厳密に検証する。
 *
 * 部分文字列マッチ (includes) を使うと
 * `https://evil.com/?x=youtube.com/embed` のような URL でバイパスできるため、
 * hostname と pathname をそれぞれ完全一致・プレフィックス一致で確認する。
 */
function isTrustedIframeSrc(src: string): boolean {
  // プロトコル相対 URL を正規化
  const normalized = src.startsWith('//') ? 'https:' + src : src;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }
  // https のみ許可（http: / javascript: / data: などを排除）
  // 信頼済みドメインは全て HTTPS を提供しており、HTTP を許可する理由がない。
  // HTTP iframe は中間者攻撃でコンテンツを差し替えられるリスクがある。
  if (url.protocol !== 'https:') return false;

  const h = url.hostname;
  const p = url.pathname;

  // ホスト名完全一致 ＋ パスプレフィックス一致で判定
  return (
    ((h === 'www.youtube.com' || h === 'youtube.com') && p.startsWith('/embed/')) ||
    ((h === 'www.youtube-nocookie.com' || h === 'youtube-nocookie.com') &&
      p.startsWith('/embed/')) ||
    h === 'player.vimeo.com' ||
    (h === 'open.spotify.com' && p.startsWith('/embed/')) ||
    h === 'w.soundcloud.com' ||
    h === 'player.twitch.tv' ||
    (h === 'clips.twitch.tv' && p.startsWith('/embed')) ||
    h === 'embed.nicovideo.jp' ||
    h === 'embed.zenn.studio'
  );
}

export function sanitizeHtml(html: string): string {
  return html
    // 閉じタグを持つブロック要素を除去。
    // [\s\S]*? (非貪欲) を使用することで、tempered greedy token パターン
    // [^<]*(?:(?!<\/tag>)<[^<]*)* による ReDoS（カタストロフィックバックトラッキング）を防ぐ。
    // <tag> 未閉じの場合は次の </ まで除去するため、開始タグが残ることもあるが
    // セキュリティ上は許容範囲（後続のイベントハンドラ除去が補完する）。
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // <link> タグを除去（React 19 のリソースホイスティングによる無限ループ防止）
    .replace(/<link\b[^>]*\/?>/gi, '')
    // <base> タグを除去（相対 URL ハイジャック防止）
    .replace(/<base\b[^>]*\/?>/gi, '')
    // <noscript> を除去（JavaScript 無効環境でのレンダリング防止）
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    // <template> を除去（DOM ツリーに挿入可能な任意 HTML の封じ込め）
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    // <object>, <embed> を除去
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    // SVG <foreignObject> を除去（任意の HTML を埋め込める危険な要素）
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<foreignObject\b[^>]*\/>/gi, '')
    // SVG アニメーション要素を除去（attributeName 経由のイベントハンドラ注入防止）
    // <animate attributeName="href" to="javascript:alert(1)"> 等で href/イベントハンドラを
    // 動的に書き換えられるため、animate / animateTransform / animateMotion / set を除去する
    .replace(/<animate\b[^>]*\/?>/gi, '')
    .replace(/<animateTransform\b[^>]*\/?>/gi, '')
    .replace(/<animateMotion\b[^>]*>[\s\S]*?<\/animateMotion>/gi, '')
    .replace(/<animateMotion\b[^>]*\/?>/gi, '')
    .replace(/<set\b[^>]*\/?>/gi, '')
    // SVG <use> の外部参照を除去（クロスオリジン SVG 読み込みによるプライバシー侵害防止）
    // href / xlink:href が # のみのフラグメント参照は同一ドキュメント内なので安全、それ以外を除去
    //
    // 処理順序:
    //   1. <use ...>...</use> ペア: 外部参照ならフォールバックコンテンツごと除去、フラグメント参照は保持
    //   2. 残余の <use ...> （自己閉じ・未閉じ開始タグ）: 同様に href を検査して除去/保持
    //
    // 注意: </use> の後続削除は行わない。
    // ステップ1が <use>...</use> ペアを一括処理するため、外部参照の </use> は既に除去済み。
    // 孤立した </use> はブラウザが無視するため、セキュリティリスクはない。
    .replace(/<use\b([^>]*)>([\s\S]*?)<\/use>/gi, (_m, attrs: string) => {
      const hrefMatch = attrs.match(/\b(?:xlink:)?href\s*=\s*["']([^"']*?)["']/i);
      const href = hrefMatch?.[1] ?? '';
      // フラグメントのみ (#id) は許可、外部参照・空 href は要素ごと（フォールバック含む）除去
      return /^#[^#]*$/.test(href) ? _m : '';
    })
    // 自己閉じタグ・未閉じ開始タグを処理（上記でマッチしなかった残余）
    .replace(/<use\b([^>]*)>/gi, (_m, attrs: string) => {
      const hrefMatch = attrs.match(/\b(?:xlink:)?href\s*=\s*["']([^"']*?)["']/i);
      const href = hrefMatch?.[1] ?? '';
      return /^#[^#]*$/.test(href) ? _m : '';
    })
    // <iframe> は信頼済みドメイン以外を除去
    .replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe>/gi, (_m, attrs) => {
      const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
      const src = srcMatch?.[1] ?? '';
      return isTrustedIframeSrc(src) ? _m : '';
    })
    .replace(/<iframe\b[^>]*\/>/gi, '')
    // 危険な <meta http-equiv> を除去。
    // - refresh: クライアントサイドリダイレクト防止
    // - set-cookie: レスポンスヘッダー偽装による cookie 注入防止
    // - Content-Security-Policy: 上位 CSP の上書き防止
    // - X-Frame-Options / Permissions-Policy: セキュリティポリシー上書き防止
    // - Link: 外部リソース事前読み込みによるプライバシー侵害防止
    .replace(
      /<meta\b[^>]*http-equiv\s*=\s*["'](?:refresh|set-cookie|content-security-policy|x-frame-options|permissions-policy|link)["'][^>]*\/?>/gi,
      '',
    )
    // インラインイベントハンドラを除去。
    // [\s/]+ : スペース・タブ・スラッシュ区切り（/ 区切りバイパス対策）
    // (?<=['"]): 引用符直後に on\w+ が来るケース（<img src="x"onerror=...>）のバイパス対策
    .replace(/(?:[\s/]+|(?<=['"]))on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // xlink:href（SVG）の javascript: / vbscript: / data: スキームを除去（完全な属性名を削除）
    // 汎用 href パターンより先に処理することで xlink: プレフィックスが残留しないようにする
    .replace(/xlink:href\s*=\s*["'](?:javascript|vbscript|data):[^"']*["']/gi, '')
    .replace(/xlink:href\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, '')
    // javascript: / vbscript: スキームを除去（クォートあり・なし両対応）
    .replace(/(?:href|src|action|formaction)\s*=\s*["'](?:javascript|vbscript):[^"']*["']/gi, '')
    .replace(/(?:href|src|action|formaction)\s*=\s*(?:javascript|vbscript):[^\s>]*/gi, '')
    // data: URI を src/href/action/formaction から除去（HTML インジェクション防止）
    .replace(/(?:src|href|action|formaction)\s*=\s*["']data:[^"']*["']/gi, '')
    .replace(/(?:src|href|action|formaction)\s*=\s*data:[^\s>]*/gi, '')
    // xlink:href の HTML エンティティ・先頭空白バイパスを除去
    // 汎用 href パターンより先に処理することで xlink: プレフィックスが残留しないようにする
    .replace(/xlink:href\s*=\s*"([^"]*)"/gi, (m, val) => (hasDangerousScheme(val) ? '' : m))
    .replace(/xlink:href\s*=\s*'([^']*)'/gi, (m, val) => (hasDangerousScheme(val) ? '' : m))
    // HTML エンティティや先頭空白でエンコードされた危険スキームを除去（hasDangerousScheme で検出）
    .replace(/(?:href|src|action|formaction)\s*=\s*"([^"]*)"/gi, (m, val) => (hasDangerousScheme(val) ? '' : m))
    .replace(/(?:href|src|action|formaction)\s*=\s*'([^']*)'/gi, (m, val) => (hasDangerousScheme(val) ? '' : m))
    // srcdoc 属性を除去（iframe フォールバック経由の HTML インジェクション防止）
    .replace(/\bsrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // ping 属性を除去（リンククリック時の意図しないリクエスト防止）
    .replace(/\bping\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // inline style 属性をサニタイズ（CSS トラッキング・フィッシングオーバーレイ防止）
    .replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`)
    .replace(/\bstyle\s*=\s*'([^']*)'/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`)
    .trim();
}
