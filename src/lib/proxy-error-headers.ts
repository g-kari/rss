/**
 * Binary proxy (image / video / 将来の audio 等) のエラーレスポンスに
 * `upstreamStatus` / `upstreamContentType` / `detectedMime` / `bodySize` の
 * optional Details field を `X-${prefix}-*` ヘッダーとして付与する共通 helper。
 *
 * #856: `image-error-placeholder.ts` と `video-error-placeholder.ts` で
 * prefix のみ違う 8 行の optional-header 構築が完全複製されていたため、
 * helper-drift.md「同形 if 連鎖は引数化して 1 箇所に集約」規範に従って集約。
 *
 * 値判定の semantics は既存 2 箇所の挙動を完全に維持する:
 * - `upstreamStatus` / `bodySize`: `!== undefined` (= 0 / 200 も明示的に付与)
 * - `upstreamContentType` / `detectedMime`: truthy check (= 空文字列は除外)
 */
import type { BinaryProxyErrorDetails } from "./binary-proxy-handler";

export function applyProxyErrorDetailHeaders(
  headers: Record<string, string>,
  prefix: string,
  details: BinaryProxyErrorDetails | undefined,
): void {
  if (!details) return;
  if (details.upstreamStatus !== undefined) {
    headers[`X-${prefix}-Upstream-Status`] = String(details.upstreamStatus);
  }
  if (details.upstreamContentType) {
    headers[`X-${prefix}-Upstream-Type`] = details.upstreamContentType;
  }
  if (details.detectedMime) {
    headers[`X-${prefix}-Detected-Mime`] = details.detectedMime;
  }
  if (details.bodySize !== undefined) {
    headers[`X-${prefix}-Body-Size`] = String(details.bodySize);
  }
}
