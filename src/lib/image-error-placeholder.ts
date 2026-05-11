/**
 * 画像プロキシ用エラープレースホルダー SVG 生成ユーティリティ。
 *
 * 画像取得失敗時に透明 GIF の代わりに意味のある SVG アイコンを返す。
 */

export type ImageErrorReason =
  | "not_found"
  | "network"
  | "too_large"
  | "unavailable"
  /** #749: 上流が 403 等で bot 判定で拒否 (User-Agent ベースのホットリンク保護等) */
  | "bot_blocked"
  /** #749: 上流の Content-Type が ALLOWED_IMAGE_CONTENT_TYPES に含まれない */
  | "mime_rejected"
  /** #749: 宣言された Content-Type とマジックバイト由来 MIME が不一致 */
  | "content_type_mismatch"
  /** #749: Content-Length 不明で 5MB 上限を超えた (実体サイズ不明) */
  | "size_unknown";

/**
 * #749: errorImageSvg の詳細情報 (X-Image-Proxy-* ヘッダーで返す)。
 * デバッグ時にレスポンスヘッダーから実際の失敗理由を取り出せる。
 */
export interface ImageErrorDetails {
  /** 上流レスポンスの HTTP status (network エラー時は省略) */
  upstreamStatus?: number;
  /** 上流が返した Content-Type */
  upstreamContentType?: string;
  /** マジックバイト由来の MIME (Content-Type 検証時のみ) */
  detectedMime?: string;
  /** ボディ取得時のサイズ (bytes、Content-Length なしで読み切ったとき) */
  bodySize?: number;
}

/**
 * フレーム＋アイコン＋ラベルから SVG 文字列を組み立てる。
 * アイコンは translate(60,34) 座標系（中心が原点）で記述する。
 */
function buildErrorSvg(iconFragment: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect width="120" height="80" fill="#f5f5f4" rx="4"/>
  <rect x="1" y="1" width="118" height="78" fill="none" stroke="#e7e5e4" stroke-width="1" rx="3"/>
  <g transform="translate(60,34)" stroke="#a8a29e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
    ${iconFragment}
  </g>
  <text x="60" y="64" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#a8a29e">${label}</text>
</svg>`;
}

// 壊れた画像フレーム（山＋太陽、左上に×）
const ICON_NOT_FOUND = `
  <rect x="-14" y="-12" width="28" height="24" rx="2"/>
  <polyline points="-14,4 -6,-4 0,2 7,-5 14,4"/>
  <circle cx="5" cy="-5" r="3"/>
  <line x1="-8" y1="-8" x2="-4" y2="-4" stroke="#d1cac6"/>
  <line x1="-4" y1="-8" x2="-8" y2="-4" stroke="#d1cac6"/>
`;

// Wifi アーク3本＋斜め線でネットワーク断を表現
const ICON_NETWORK = `
  <path d="M-13,-4 Q0,-18 13,-4"/>
  <path d="M-8,2 Q0,-10 8,2"/>
  <circle cx="0" cy="8" r="2" fill="#a8a29e"/>
  <line x1="-12" y1="-16" x2="12" y2="14"/>
`;

// ボックス＋上下に飛び出す矢印でサイズオーバーを表現
const ICON_TOO_LARGE = `
  <rect x="-11" y="-5" width="22" height="15" rx="2"/>
  <polyline points="-5,-2 0,-8 5,-2"/>
  <line x1="0" y1="-8" x2="0" y2="-1"/>
  <polyline points="-5,12 0,18 5,12"/>
  <line x1="0" y1="12" x2="0" y2="6"/>
`;

// 警告トライアングル＋!
const ICON_UNAVAILABLE = `
  <path d="M0,-13 L14,9 L-14,9 Z"/>
  <line x1="0" y1="-6" x2="0" y2="2"/>
  <circle cx="0" cy="6" r="1.5" fill="#a8a29e"/>
`;

const ERROR_SVGS: Record<ImageErrorReason, string> = {
  not_found: buildErrorSvg(ICON_NOT_FOUND, "Not Found"),
  network: buildErrorSvg(ICON_NETWORK, "Network Error"),
  too_large: buildErrorSvg(ICON_TOO_LARGE, "Too Large"),
  unavailable: buildErrorSvg(ICON_UNAVAILABLE, "Unavailable"),
  // #749: 新規 4 種は既存アイコンを再利用 (semantic 的に近いもの)。
  bot_blocked: buildErrorSvg(ICON_UNAVAILABLE, "Bot Blocked"),
  mime_rejected: buildErrorSvg(ICON_UNAVAILABLE, "MIME Rejected"),
  content_type_mismatch: buildErrorSvg(ICON_UNAVAILABLE, "MIME Mismatch"),
  size_unknown: buildErrorSvg(ICON_TOO_LARGE, "Size Unknown"),
};

/**
 * エラー理由に対応する SVG プレースホルダーレスポンスを返す。
 *
 * #749: details パラメータで `X-Image-Proxy-*` ヘッダーを返し、フロントエンド DevTools の
 * Network タブでレスポンスヘッダーから「なぜ画像取得が失敗したか」を即座に切り分け可能にする。
 * `X-Image-Proxy-Error` ヘッダーは常に reason 文字列を含む。
 */
export function errorImageSvg(reason: ImageErrorReason, details?: ImageErrorDetails): Response {
  const headers: Record<string, string> = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=3600",
    "X-Image-Proxy-Error": reason,
  };
  if (details?.upstreamStatus !== undefined) {
    headers["X-Image-Proxy-Upstream-Status"] = String(details.upstreamStatus);
  }
  if (details?.upstreamContentType) {
    headers["X-Image-Proxy-Upstream-Type"] = details.upstreamContentType;
  }
  if (details?.detectedMime) {
    headers["X-Image-Proxy-Detected-Mime"] = details.detectedMime;
  }
  if (details?.bodySize !== undefined) {
    headers["X-Image-Proxy-Body-Size"] = String(details.bodySize);
  }
  return new Response(ERROR_SVGS[reason], { headers });
}
