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
