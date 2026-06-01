/**
 * バイナリプロキシ (image / video / 将来追加 binary 型) の共通 handler (#757)。
 *
 * `app/api/image-proxy/route.ts` と `app/api/video-proxy/route.ts` の `handleGet` は
 * 構造が完全 mirror (auth ガード → URL 検証 → cache lookup → upstream fetch → mime 検証 →
 * Content-Length 検証 → body 取得 → magic byte 検証 → cachePutAsync) であり、媒体差分は
 * options object で関数引数化可能。本ファイルは共通フローを `handleBinaryProxy` に抽出し、
 * 両 route から thin wrapper (~30 行) で呼ぶ設計に統一する。
 *
 * 媒体差分:
 * - cache type 文字列 / cache TTL / log label
 * - MAX_BYTES (image 30MB vs video 50MB) / no-CL 上限 (image 5MB vs video 10MB)
 * - Accept ヘッダー / default cache Content-Type fallback
 * - 許可 MIME 集合 + マジックバイト検出関数
 * - error response 戻り型 (image: SVG body 200 / video: null body)
 * - Qiita imgix Referer 上書き (image のみ)
 * - declared vs detected MIME の整合性チェック (image のみ詳細、video は集合チェックで完結)
 */
import { formatError } from "@/lib/api-error";
import { isValidPublicUrl } from "@/lib/url";
import { buildCacheKey, cachePutAsync, deleteCfCache, matchCfCache } from "@/lib/cache-helper";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchFollowSafeRedirects,
  isAbortError,
  readBodyBytes,
} from "@/lib/fetch";
import { isSameOriginImageRequest } from "@/lib/image-proxy-security";

/** プロキシエラー応答の詳細パラメータ (`X-{Service}-*` ヘッダー注入用) */
export interface BinaryProxyErrorDetails {
  upstreamStatus?: number;
  upstreamContentType?: string;
  bodySize?: number;
  detectedMime?: string;
}

/** reason 値の集合 (媒体別の reason union に generic で対応) */
export interface BinaryProxyReasonMap<Reason extends string> {
  /** HTTP 404 */
  notFound: Reason;
  /** HTTP 403 (bot 判定相当) */
  botBlocked: Reason;
  /** 上流 fetch 失敗 (404/403 以外の non-ok / no body) */
  unavailable: Reason;
  /** 許可されていない MIME タイプ */
  mimeRejected: Reason;
  /** Content-Length 既知 or 読込中の上限超過 */
  tooLarge: Reason;
  /** Content-Length 不明 + 上限超過 */
  sizeUnknown: Reason;
  /** declared vs detected MIME 不一致 */
  contentTypeMismatch: Reason;
  /** fetch 例外 (network / timeout / DNS 等) */
  network: Reason;
}

export interface BinaryProxyOptions<Reason extends string> {
  /** ログラベル (例: "image-proxy", "video-proxy") */
  label: string;
  /** cache key の type 文字列 (例: "image", "video") */
  cacheType: string;
  /** Cache-Control max-age 秒 (image / video 共に 30 日想定) */
  cacheTtlSec: number;
  /** Content-Length 既知時の最大バイト数 */
  maxBytes: number;
  /** Content-Length 不明時の最大バイト数 (CL がない場合のメモリ圧迫回避) */
  maxBytesNoContentLength: number;
  /** Accept ヘッダー値 (例: image / video のワイルドカード) */
  acceptHeader: string;
  /** cache hit 時の Content-Type fallback (例: "image/jpeg", "video/mp4") */
  defaultCacheContentType: string;
  /** 許可された Content-Type 集合 */
  allowedContentTypes: ReadonlySet<string>;
  /**
   * マジックバイト検証関数。bytes から MIME タイプを返す (null = 検出失敗 = 不正 binary)。
   * image: `detectImageMimeType`、video: `detectVideoMimeType` 等
   */
  detectMimeType: (bytes: Uint8Array) => string | null;
  /**
   * 検出された MIME タイプが許可セットに含まれるかの追加判定 (オプション)。
   * image-proxy では `isContentTypeConsistent(declared, detected)` で declared/detected 不一致
   * (キャッシュ汚染攻撃) を拒否する。video-proxy では `ALLOWED_VIDEO_CONTENT_TYPES` 集合チェック
   * のみで完結するため未指定。
   */
  isConsistentMime?: (declaredCt: string, detectedMime: string) => boolean;
  /**
   * Referer の上書き (例: Qiita imgix 用)。null を返すと origin + "/" の default を使う。
   * 未指定なら常に origin + "/"。
   */
  refererOverride?: (url: string) => string | null;
  /**
   * エラー応答生成関数。media 別の error placeholder (SVG body / null body) を吸収する。
   * 例: `errorImageSvg(reason, details)` / `errorVideoResponse(reason, details)`
   */
  errorResponse: (reason: Reason, details?: BinaryProxyErrorDetails) => Response;
  /** HTTP status / mime / size / network 等から reason 値を選択するマップ */
  reasonMap: BinaryProxyReasonMap<Reason>;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * バイナリプロキシ共通 handler。両 route の `handleGet` を thin wrapper 化するための実装。
 *
 * フロー:
 * 1. same-origin 検証 (Sec-Fetch-Site / Referer) → 失敗で 403
 * 2. URL 検証 (空 / SSRF) → 失敗で 400
 * 3. Cache lookup → HIT で 200 + X-Cache: HIT
 * 4. Upstream fetch (User-Agent / Accept / Referer ヘッダー付与)
 * 5. !res.ok → reasonMap.notFound / botBlocked / unavailable
 * 6. MIME validation (declared CT が allowed 集合に含まれるか、または magic byte 検証必要か)
 * 7. Content-Length 検証 (既知時上限超え / 不明時の effective max 決定)
 * 8. body 読み込み (readBodyBytes で effectiveMax まで)
 * 9. magic byte 検証 + (optional) declared/detected consistency check
 * 10. cachePutAsync で Cache 保存 + 200 + X-Cache: MISS で返す
 * 11. fetch 例外 → reasonMap.network
 */
export async function handleBinaryProxy<Reason extends string>(
  request: Request,
  ctx: ExecutionContext,
  options: BinaryProxyOptions<Reason>,
): Promise<Response> {
  const reqUrl = new URL(request.url);

  // CSP / SSRF 保護: 同一オリジン (Sec-Fetch-Site / Referer) のみ受け付け
  if (!isSameOriginImageRequest(request.headers, reqUrl.origin)) {
    return new Response(null, { status: 403 });
  }

  const url = reqUrl.searchParams.get("url");
  if (!url) return new Response(null, { status: 400 });
  if (!isValidPublicUrl(url)) return new Response(null, { status: 400 });
  const logUrl = url.replace(/[\r\n]/g, "").slice(0, 256);

  const cacheKey = await buildCacheKey(reqUrl.origin, options.cacheType, url);

  const cached = await matchCfCache(cacheKey);
  if (cached) {
    // #853 (security 案 B): cache poisoning 防御として cache 取り出し時に MIME 再検証する。
    // 攻撃者制御 URL の upstream が後から別 MIME を返すケースで cache に poisoned content
    // が残ったままになるシナリオを防ぐ。magic byte 検証で mismatch を検出したら cache を
    // 即時削除し、upstream 再 fetch (cache miss 経路) へフォールバックする。
    // 発火タイミング: cache get 直後 (response 構築前) — デフォルト判断
    // cache invalidate ロジック: 即時削除 — デフォルト判断
    const cachedBody = cached.body ? await readBodyBytes(cached.body, options.maxBytes) : null;
    if (cachedBody !== null) {
      const cachedDetectedMime = options.detectMimeType(cachedBody);
      if (cachedDetectedMime && options.allowedContentTypes.has(cachedDetectedMime)) {
        return new Response(cachedBody, {
          headers: {
            "Content-Type": cached.headers.get("Content-Type") ?? options.defaultCacheContentType,
            "Cache-Control": `public, max-age=${options.cacheTtlSec}`,
            "X-Cache": "HIT",
            "Cross-Origin-Resource-Policy": "same-origin",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      console.error(
        `[${options.label}] cache poisoning detected: url=${logUrl} cached-content-type="${cached.headers.get("Content-Type") ?? ""}" detected="${cachedDetectedMime ?? "null"}" — invalidating cache and re-fetching upstream`,
      );
      await deleteCfCache(cacheKey);
    } else {
      // body 読み込み失敗 (size 超過 / 不在) も poisoned とみなして invalidate
      console.error(
        `[${options.label}] cache body unreadable: url=${logUrl} — invalidating cache and re-fetching upstream`,
      );
      await deleteCfCache(cacheKey);
    }
  }

  try {
    const overrideReferer = options.refererOverride?.(url) ?? null;
    const referer = overrideReferer ?? new URL(url).origin + "/";

    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Accept: options.acceptHeader,
          Referer: referer,
        },
      },
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    if (!res.ok) {
      console.error(
        `[${options.label}] upstream not ok: url=${logUrl} status=${res.status} content-type="${ct}"`,
      );
      const reason =
        res.status === 404
          ? options.reasonMap.notFound
          : res.status === 403
            ? options.reasonMap.botBlocked
            : options.reasonMap.unavailable;
      return options.errorResponse(reason, {
        upstreamStatus: res.status,
        upstreamContentType: ct || undefined,
      });
    }

    const needsMagicCheck = ct === "application/octet-stream" || ct === "";

    if (!needsMagicCheck && !options.allowedContentTypes.has(ct)) {
      console.error(`[${options.label}] MIME rejected: url=${logUrl} content-type="${ct}"`);
      return options.errorResponse(options.reasonMap.mimeRejected, {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }

    const contentLength = res.headers.get("content-length");
    const clBytes = contentLength ? parseInt(contentLength, 10) : NaN;
    if (contentLength && clBytes > options.maxBytes) {
      console.error(
        `[${options.label}] too large (Content-Length): url=${logUrl} cl=${clBytes} max=${options.maxBytes}`,
      );
      return options.errorResponse(options.reasonMap.tooLarge, {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        bodySize: clBytes,
      });
    }

    const effectiveMax =
      contentLength && clBytes <= options.maxBytes
        ? options.maxBytes
        : options.maxBytesNoContentLength;

    if (!res.body) {
      console.error(`[${options.label}] no body: url=${logUrl} content-type="${ct}"`);
      return options.errorResponse(options.reasonMap.unavailable, {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }
    const merged = await readBodyBytes(res.body, effectiveMax);
    if (merged === null) {
      console.error(
        `[${options.label}] size unknown over limit: url=${logUrl} content-type="${ct}" cl-header=${contentLength ?? "none"} effective-max=${effectiveMax}`,
      );
      return options.errorResponse(
        contentLength ? options.reasonMap.tooLarge : options.reasonMap.sizeUnknown,
        {
          upstreamStatus: res.status,
          upstreamContentType: ct,
        },
      );
    }

    const mimeType = options.detectMimeType(merged);
    if (!mimeType || !options.allowedContentTypes.has(mimeType)) {
      console.error(
        `[${options.label}] magic bytes detection failed: url=${logUrl} content-type="${ct}" detected="${mimeType ?? "null"}" body-size=${merged.byteLength}`,
      );
      return options.errorResponse(options.reasonMap.contentTypeMismatch, {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        detectedMime: mimeType ?? undefined,
        bodySize: merged.byteLength,
      });
    }

    // 追加 consistency check (image-proxy のみ使用): declared vs detected 不一致を拒否
    if (options.isConsistentMime && !options.isConsistentMime(ct, mimeType)) {
      console.error(
        `[${options.label}] content-type mismatch: url=${logUrl} declared="${ct}" detected="${mimeType}"`,
      );
      return options.errorResponse(options.reasonMap.contentTypeMismatch, {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        detectedMime: mimeType,
        bodySize: merged.byteLength,
      });
    }

    cachePutAsync(
      cacheKey,
      new Response(merged, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": `public, max-age=${options.cacheTtlSec}`,
        },
      }),
      ctx,
      options.label,
    );

    return new Response(merged, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": `public, max-age=${options.cacheTtlSec}`,
        "X-Cache": "MISS",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (!isAbortError(err)) {
      console.error(`[${options.label}] fetch error:`, formatError(err));
    }
    return options.errorResponse(options.reasonMap.network);
  }
}
