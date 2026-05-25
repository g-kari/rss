/**
 * 動画プロキシ用エラーレスポンス生成ユーティリティ (#751)。
 *
 * `image-error-placeholder.ts` の pattern を mirror。body は null のまま (`<video>`
 * element は SVG / placeholder content を表示できないため、broken-video icon を
 * native に表示させる)、`X-Video-Proxy-*` ヘッダーで observability を確保する。
 *
 * DevTools Network タブでレスポンスヘッダーから「なぜ動画取得が失敗したか」を
 * 即座に切り分け可能にし、`wrangler tail` のサーバーログと二段で観測性を担保する
 * (browser-platform.md「上流 API プロキシのエラー観測性は server-side log + response
 * header の二段で構造化」規範に従う)。
 */

export type VideoErrorReason =
  | "not_found"
  | "network"
  | "too_large"
  | "unavailable"
  /** 上流が 403 等で bot 判定で拒否 (User-Agent ベースのホットリンク保護等) */
  | "bot_blocked"
  /** 上流の Content-Type が ALLOWED_VIDEO_CONTENT_TYPES に含まれない */
  | "mime_rejected"
  /** 宣言された Content-Type とマジックバイト由来 MIME が不一致 */
  | "content_type_mismatch"
  /** Content-Length 不明で 10MB 上限を超えた (実体サイズ不明) */
  | "size_unknown";

/**
 * errorVideoResponse の詳細情報 (`X-Video-Proxy-*` ヘッダーで返す)。
 * デバッグ時にレスポンスヘッダーから実際の失敗理由を取り出せる。
 *
 * 同等 type が binary-proxy-handler.ts に `BinaryProxyErrorDetails` として定義済のため
 * type alias で統合 (helper-drift.md § 同名 enum / type の重複は canonical の alias 化)。
 */
import type { BinaryProxyErrorDetails } from "./binary-proxy-handler";
import { applyProxyErrorDetailHeaders } from "./proxy-error-headers";
export type VideoErrorDetails = BinaryProxyErrorDetails;

/** 各 reason に対応する HTTP status (image-proxy と同じ semantic を維持)。 */
const REASON_TO_STATUS: Record<VideoErrorReason, number> = {
  not_found: 404,
  bot_blocked: 403,
  network: 502,
  too_large: 413,
  size_unknown: 413,
  mime_rejected: 415,
  content_type_mismatch: 415,
  unavailable: 502,
};

/**
 * エラー理由に対応する null body レスポンスを返す (`X-Video-Proxy-*` ヘッダー付与)。
 *
 * image-proxy の `errorImageSvg` を mirror した API。body が SVG ではなく null である
 * 理由は、HTML `<video>` element は body content (SVG / 別 mp4) を fallback として表示
 * できず、broken-video icon が native UX として最も無難なため。観測性は header に集約。
 *
 * `X-Video-Proxy-Error` ヘッダーは常に reason 文字列を含む。
 */
export function errorVideoResponse(
  reason: VideoErrorReason,
  details?: VideoErrorDetails,
): Response {
  const headers: Record<string, string> = {
    "X-Video-Proxy-Error": reason,
  };
  applyProxyErrorDetailHeaders(headers, "Video-Proxy", details);
  return new Response(null, { status: REASON_TO_STATUS[reason], headers });
}
