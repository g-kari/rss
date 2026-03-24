/**
 * HTML サニタイズユーティリティ
 *
 * XSS・インジェクション対策のための正規表現ベースのサニタイズ関数。
 * RSS フィードの content と外部ページ取得の両方で共有する。
 */

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
  // https / http のみ許可（javascript: / data: などを排除）
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

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
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // <link> タグを除去（React 19 のリソースホイスティングによる無限ループ防止）
    .replace(/<link\b[^>]*\/?>/gi, '')
    // <base> タグを除去（相対 URL ハイジャック防止）
    .replace(/<base\b[^>]*\/?>/gi, '')
    // <object>, <embed> を除去
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    // <iframe> は信頼済みドメイン以外を除去
    .replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe>/gi, (_m, attrs) => {
      const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
      const src = srcMatch?.[1] ?? '';
      return isTrustedIframeSrc(src) ? _m : '';
    })
    .replace(/<iframe\b[^>]*\/>/gi, '')
    // <meta http-equiv="refresh"> を除去（クライアントサイドリダイレクト防止）
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*\/?>/gi, '')
    // インラインイベントハンドラを除去（/ 区切りのバイパス対策として [\s/]+ を使用）
    .replace(/[\s/]+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // javascript: / vbscript: スキームを除去（クォートあり・なし両対応）
    .replace(/(?:href|src|action|formaction)\s*=\s*["'](?:javascript|vbscript):[^"']*["']/gi, '')
    .replace(/(?:href|src|action|formaction)\s*=\s*(?:javascript|vbscript):[^\s>]*/gi, '')
    // data: URI を src/href/action/formaction から除去（HTML インジェクション防止）
    .replace(/(?:src|href|action|formaction)\s*=\s*["']data:[^"']*["']/gi, '')
    .replace(/(?:src|href|action|formaction)\s*=\s*data:[^\s>]*/gi, '')
    // srcdoc 属性を除去（iframe フォールバック経由の HTML インジェクション防止）
    .replace(/\bsrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // ping 属性を除去（リンククリック時の意図しないリクエスト防止）
    .replace(/\bping\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // inline style 属性をサニタイズ（CSS トラッキング・フィッシングオーバーレイ防止）
    .replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`)
    .replace(/\bstyle\s*=\s*'([^']*)'/gi, (_m, s) => `style="${sanitizeStyleAttr(s)}"`)
    .trim();
}
