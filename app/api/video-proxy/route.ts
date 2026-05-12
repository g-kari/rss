/**
 * Video proxy route — `handleBinaryProxy` 共通 handler の thin wrapper (#757)。
 *
 * 共通フロー (auth ガード → URL 検証 → cache lookup → upstream fetch → MIME 検証 → body
 * 取得 → magic byte 検証 → cachePutAsync) は `src/lib/binary-proxy-handler.ts` に集約済み。
 * 本 route は video 媒体固有の差分のみ options object として渡す。
 *
 * Video 媒体差分:
 * - cache type: "video" / TTL 30 日 / max MAX_VIDEO_BYTES (CL あり) or 10MB (CL なし)
 * - Accept: video のワイルドカード / default Content-Type: video/mp4
 * - 許可 MIME: `ALLOWED_VIDEO_CONTENT_TYPES`、magic byte: `detectVideoMimeType`
 * - declared vs detected 整合性チェックなし (ALLOWED_VIDEO 集合チェックで完結)
 * - Referer override なし
 * - error response: null body (`errorVideoResponse`)
 */
import { withBinarySession } from "@/lib/server-auth";
import { handleBinaryProxy } from "@/lib/binary-proxy-handler";
import { ALLOWED_VIDEO_CONTENT_TYPES, detectVideoMimeType } from "@/lib/video-mime";
import {
  errorVideoResponse,
  type VideoErrorReason,
  type VideoErrorDetails,
} from "@/lib/video-error-placeholder";
import { MAX_VIDEO_BYTES } from "@/lib/validation";

const VIDEO_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日 (image と同じ、#715)
const MAX_VIDEO_BYTES_NO_CL = 10 * 1024 * 1024; // 10MB

export async function GET(request: Request) {
  return withBinarySession(request, ({ ctx }) =>
    handleBinaryProxy<VideoErrorReason>(request, ctx, {
      label: "video-proxy",
      cacheType: "video",
      cacheTtlSec: VIDEO_CACHE_TTL_SEC,
      maxBytes: MAX_VIDEO_BYTES,
      maxBytesNoContentLength: MAX_VIDEO_BYTES_NO_CL,
      acceptHeader: "video/*,*/*",
      defaultCacheContentType: "video/mp4",
      allowedContentTypes: ALLOWED_VIDEO_CONTENT_TYPES,
      detectMimeType: detectVideoMimeType,
      errorResponse: (reason, details) => errorVideoResponse(reason, details as VideoErrorDetails),
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
