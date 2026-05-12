/**
 * Image proxy route — `handleBinaryProxy` 共通 handler の thin wrapper (#757)。
 *
 * 共通フロー (auth ガード → URL 検証 → cache lookup → upstream fetch → MIME 検証 → body
 * 取得 → magic byte 検証 → cachePutAsync) は `src/lib/binary-proxy-handler.ts` に集約済み。
 * 本 route は image 媒体固有の差分のみ options object として渡す。
 *
 * Image 媒体差分:
 * - cache type: "image" / TTL 30 日 / max 30MB (CL あり) or 5MB (CL なし)
 * - Accept: "image/*,*\/*" / default Content-Type: image/jpeg
 * - 許可 MIME: `ALLOWED_IMAGE_CONTENT_TYPES`、magic byte: `detectImageMimeType`
 * - declared vs detected 整合性: `isContentTypeConsistent` (キャッシュ汚染防止)
 * - Qiita imgix Referer 上書き: `.imgix.net` かつホスト名に "qiita" を含む場合 `https://qiita.com/`
 * - error response: SVG body 200 (`errorImageSvg`)
 */
import { withBinarySession } from "@/lib/server-auth";
import { handleBinaryProxy } from "@/lib/binary-proxy-handler";
import { ALLOWED_IMAGE_CONTENT_TYPES, detectImageMimeType } from "@/lib/image-mime";
import {
  errorImageSvg,
  type ImageErrorReason,
  type ImageErrorDetails,
} from "@/lib/image-error-placeholder";
import { isContentTypeConsistent } from "@/lib/image-proxy-security";
import { MAX_IMAGE_BYTES } from "@/lib/validation";

const IMAGE_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const MAX_IMAGE_BYTES_NO_CL = 5 * 1024 * 1024; // 5MB

/**
 * #720: Qiita imgix CDN は qiita.com 以外の Referer を拒否する。`.imgix.net` かつホスト名に
 * "qiita" を含む場合のみ Referer を `https://qiita.com/` に差し替える。他サービスの imgix では
 * origin そのままを維持。
 */
function qiitaImgixRefererOverride(url: string): string | null {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.endsWith(".imgix.net") && hostname.includes("qiita")) {
    return "https://qiita.com/";
  }
  return null;
}

export async function GET(request: Request) {
  return withBinarySession(request, ({ ctx }) =>
    handleBinaryProxy<ImageErrorReason>(request, ctx, {
      label: "image-proxy",
      cacheType: "image",
      cacheTtlSec: IMAGE_CACHE_TTL_SEC,
      maxBytes: MAX_IMAGE_BYTES,
      maxBytesNoContentLength: MAX_IMAGE_BYTES_NO_CL,
      acceptHeader: "image/*,*/*",
      defaultCacheContentType: "image/jpeg",
      allowedContentTypes: ALLOWED_IMAGE_CONTENT_TYPES,
      detectMimeType: detectImageMimeType,
      isConsistentMime: isContentTypeConsistent,
      refererOverride: qiitaImgixRefererOverride,
      errorResponse: (reason, details) => errorImageSvg(reason, details as ImageErrorDetails),
      reasonMap: {
        notFound: "not_found",
        botBlocked: "bot_blocked",
        unavailable: "unavailable",
        mimeRejected: "mime_rejected",
        tooLarge: "too_large",
        sizeUnknown: "size_unknown",
        contentTypeMismatch: "content_type_mismatch",
        network: "network",
      },
    }),
  );
}
