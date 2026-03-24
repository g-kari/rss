/**
 * HTML サニタイズユーティリティ
 *
 * XSS・インジェクション対策のための正規表現ベースのサニタイズ関数。
 * RSS フィードの content と外部ページ取得の両方で共有する。
 */

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
      const trusted = [
        'youtube.com/embed',
        'youtube-nocookie.com/embed',
        'player.vimeo.com',
        'open.spotify.com/embed',
        'w.soundcloud.com',
        'player.twitch.tv',
        'clips.twitch.tv/embed',
        'embed.nicovideo.jp',
        'embed.zenn.studio',
      ];
      return trusted.some((d) => src.includes(d))
        ? _m
        : '';
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
    .trim();
}
