import { isValidFeedUrl } from "@/lib/url";

/** 外部 HTTP フェッチのデフォルトタイムアウト（ミリ秒）*/
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/** RSS/XML と CSS セレクタ用 HTML の最大レスポンスサイズ（10 MiB）。 */
export const FEED_MAX_BYTES = 10 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Response body exceeds maximum size of ${maxBytes} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/**
 * 外部 RSS / HTML fetch 用の User-Agent。
 *
 * internal service (0g0-id 等) への fetch は URL suffix 付きの別 UA
 * (`auth.ts` の `INTERNAL_SERVICE_USER_AGENT` / 既定 `rss-reader/1.0 (+https://rss.0g0.xyz)`)
 * を使う。両者は意図的に別系統なので統合しないこと。
 */
export const RSS_USER_AGENT = "rss-reader/1.0";

/** AbortController によるキャンセル・タイムアウト由来のエラーかを判定する */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

const MAX_REDIRECTS = 5;

function cancelResponseBody(response: Response): void {
  try {
    void response.body?.cancel().catch(() => {});
  } catch {
    // Cleanup cannot replace a timeout or the original redirect/transport error.
  }
}

/** チャンク配列を 1 つの Uint8Array に結合する */
function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array<ArrayBuffer> {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * ReadableStream からバイト列を読み込む共通実装。
 * strict=true: maxBytes 超過時に null を返す（readBodyBytes）
 * strict=false: maxBytes 到達時点で打ち切り、常に Uint8Array を返す（readBodyBytesPartial）
 */
async function readBodyBytesCore(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  strict: boolean,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | null> {
  signal?.throwIfAborted();
  const reader = body.getReader();
  // Do not await cleanup: an upstream cancel hook can stall or reject too.
  const cancel = () => {
    try {
      void reader.cancel().catch(() => {});
    } catch {
      // Preserve the original read/timeout failure if cleanup throws synchronously.
    }
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      totalBytes += value.byteLength;
      if (strict) {
        if (totalBytes > maxBytes) return null;
        chunks.push(value);
      } else {
        const over = totalBytes - maxBytes;
        if (over > 0) {
          chunks.push(value.slice(0, value.byteLength - over));
          totalBytes -= over;
        } else {
          chunks.push(value);
        }
        if (totalBytes >= maxBytes) break;
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    cancel();
    if (signal) {
      try {
        reader.releaseLock();
      } catch {
        // Best-effort cleanup must not replace the original error.
      }
    }
  }
  return concatChunks(chunks, totalBytes);
}

/**
 * ReadableStream からバイト列を最大 maxBytes まで読み込む。
 * maxBytes を超えた場合は null を返す。
 */
export async function readBodyBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  return readBodyBytesCore(body, maxBytes, true);
}

/**
 * ReadableStream から先頭 maxBytes バイトだけ読み込む（部分読み込み）。
 * maxBytes に達した時点で読み込みを打ち切り、収集済みのバイト列を返す。
 * 上限オーバーで null を返す readBodyBytes と異なり、常に Uint8Array を返す。
 */
export async function readBodyBytesPartial(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  return readBodyBytesCore(body, maxBytes, false, signal) as Promise<Uint8Array<ArrayBuffer>>;
}

/**
 * Content-Length が上限を超える応答は本文を読まずに拒否する。
 * 欠落・過少申告・圧縮転送では宣言を信用せず、読み取り側で実測も制限する。
 */
export function rejectDeclaredOversizedBody(response: Response, maxBytes: number): void {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new BodyTooLargeError(maxBytes);
  }
}

/**
 * レスポンスをバイト数で制限しながら UTF-8 デコードする。超過時は部分成功にしない。
 * Content-Length は早期拒否にのみ使い、欠落・過少申告・圧縮に備えて実測も必ず制限する。
 * 生バイトの全チャンク保持 + 結合コピーを避け、本文待ちにもタイムアウトを適用する。
 */
export async function readResponseText(
  response: Response,
  maxBytes: number,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<string> {
  rejectDeclaredOversizedBody(response, maxBytes);
  if (!response.body) return "";
  const reader = response.body.getReader();
  return withTimeout(timeoutMs, async (signal) => {
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    const decoder = new TextDecoder();
    const parts: string[] = [];
    let pending: string[] = [];
    let pendingChars = 0;
    let totalBytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) throw new BodyTooLargeError(maxBytes);
        const text = decoder.decode(value, { stream: true });
        if (!text) continue;
        pending.push(text);
        pendingChars += text.length;
        // 極小チャンクが大量に来ても文字列配列の要素数を上限内に保つ。
        if (pendingChars >= 64 * 1024) {
          parts.push(pending.join(""));
          pending = [];
          pendingChars = 0;
        }
      }
      pending.push(decoder.decode());
      parts.push(pending.join(""));
      return parts.join("");
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  });
}

/**
 * タイムアウト付き AbortSignal で非同期処理を実行する内部ヘルパー。
 * タイムアウト時は AbortError をスローする。
 */
async function withTimeout<T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * fetch にタイムアウトを付与するラッパー。
 * タイムアウト時は AbortError をスローする。
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  return withTimeout(timeoutMs, (signal) => fetch(url, { ...init, signal }));
}

/** Additional caller restrictions cannot replace the shared redirect safety checks. */
export interface SafeRedirectPolicy {
  validateUrl?: (url: string) => boolean;
  /** The requested final URL, rather than the upstream-controlled Response.url. */
  onResponseUrl?: (url: string) => void;
}

/**
 * リダイレクトを安全に追跡する fetch ラッパー。
 * 各リダイレクト先を isValidFeedUrl で検証し、プライベート IP への
 * オープンリダイレクト経由 SSRF を防ぐ。
 * タイムアウト時は AbortError をスローする。
 * sharedSignal 指定時は caller が headers/body を含む全体 deadline を所有する。
 * checkSharedDeadline を併用すると timer 配信前の絶対期限も各 hop 境界で確認する。
 * 未指定の既存 caller は従来どおり timeoutMs の headers/redirect timeout を使用する。
 */
export function fetchFollowSafeRedirects(
  url: string,
  init: Omit<RequestInit, "redirect">,
  timeoutMs: number,
  sharedSignal?: AbortSignal,
  checkSharedDeadline?: () => void,
  policy: SafeRedirectPolicy = {},
): Promise<Response> {
  const check = (signal: AbortSignal) => {
    if (sharedSignal) checkSharedDeadline?.();
    signal.throwIfAborted();
  };
  const follow = async (signal: AbortSignal) => {
    if (policy.validateUrl && (!isValidFeedUrl(url) || !policy.validateUrl(url))) {
      throw new Error("Initial URL rejected by fetch policy");
    }
    let currentUrl = url;
    let redirectCount = 0;
    const visitedUrls = new Set<string>([url]);

    while (redirectCount < MAX_REDIRECTS) {
      check(signal);
      const res = await fetch(currentUrl, {
        ...init,
        signal,
        redirect: "manual",
      });
      if (sharedSignal) {
        try {
          // Do not follow/read a late result, even before the abort timer is delivered.
          check(signal);
        } catch (err) {
          cancelResponseBody(res);
          throw err;
        }
      }

      // 304 Not Modified はリダイレクトではなく「変更なし」を示す。
      // Location ヘッダーを持たないため、リダイレクト追跡の対象外としてそのまま返す。
      if (res.status === 304) {
        policy.onResponseUrl?.(currentUrl);
        return res;
      }

      // 安全なリダイレクトコードのみ追跡する。
      // 300 (Multiple Choices) / 305 (Use Proxy, 廃止) / 306 (廃止) 等は除外。
      if (
        res.status === 301 ||
        res.status === 302 ||
        res.status === 303 ||
        res.status === 307 ||
        res.status === 308
      ) {
        // 読まない redirect body を解放して接続とバッファを次 hop へ持ち越さない。
        cancelResponseBody(res);
        const location = res.headers.get("location");
        if (!location) throw new Error("Redirect without Location header");
        const nextUrl = new URL(location, currentUrl).href;
        // HTTPS → HTTP へのダウングレードリダイレクトを拒否
        if (new URL(currentUrl).protocol === "https:" && new URL(nextUrl).protocol !== "https:") {
          throw new Error(`HTTPS to HTTP downgrade redirect blocked: ${nextUrl}`);
        }
        if (!isValidFeedUrl(nextUrl)) {
          throw new Error(`Redirect to blocked URL: ${nextUrl}`);
        }
        if (policy.validateUrl && !policy.validateUrl(nextUrl)) {
          throw new Error("Redirect URL rejected by fetch policy");
        }
        if (policy.validateUrl && !policy.validateUrl(nextUrl)) {
          throw new Error("Redirect URL rejected by fetch policy");
        }
        if (visitedUrls.has(nextUrl)) {
          throw new Error(`Redirect loop detected: ${nextUrl}`);
        }
        visitedUrls.add(nextUrl);
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      policy.onResponseUrl?.(currentUrl);
      policy.onResponseUrl?.(currentUrl);
      return res;
    }
    throw new Error(`Too many redirects (>=${MAX_REDIRECTS})`);
  };
  return sharedSignal ? follow(sharedSignal) : withTimeout(timeoutMs, follow);
}

/** Cache-Control 由来の次回フェッチ間隔の下限（秒）— cron 間隔（30 分）以下の値は効果がないためここに合わせる */
export const CACHE_CONTROL_MIN_SECONDS = 1800;
/** Cache-Control 由来の次回フェッチ間隔の上限（秒）— 極端に長い max-age でも 6 時間で区切る */
export const CACHE_CONTROL_MAX_SECONDS = 21600;

/** parseCacheControl の結果 */
export interface CacheControlDirectives {
  /** no-store が指定されている（キャッシュ禁止 → 常に再取得） */
  noStore: boolean;
  /** no-cache または must-revalidate が指定されている（再検証必須） */
  mustRevalidate: boolean;
  /** s-maxage または max-age の秒数（なければ null） */
  maxAgeSeconds: number | null;
}

/**
 * HTTP Cache-Control ヘッダー値をパースする純粋関数。
 * s-maxage が設定されていれば優先する（共有キャッシュ指示を尊重）。
 * 壊れた値（負数・非数値）は無視する。
 */
export function parseCacheControl(headerValue: string | null | undefined): CacheControlDirectives {
  const result: CacheControlDirectives = {
    noStore: false,
    mustRevalidate: false,
    maxAgeSeconds: null,
  };
  if (!headerValue) return result;

  let maxAge: number | null = null;
  let sMaxage: number | null = null;

  for (const rawToken of headerValue.split(",")) {
    const token = rawToken.trim().toLowerCase();
    if (!token) continue;
    if (token === "no-store") {
      result.noStore = true;
      continue;
    }
    if (token === "no-cache" || token === "must-revalidate" || token === "proxy-revalidate") {
      result.mustRevalidate = true;
      continue;
    }
    const eq = token.indexOf("=");
    if (eq === -1) continue;
    const name = token.slice(0, eq).trim();
    const rawValue = token
      .slice(eq + 1)
      .trim()
      .replace(/^"|"$/g, "");
    const num = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(num) || num < 0) continue;
    if (name === "max-age") maxAge = num;
    else if (name === "s-maxage") sMaxage = num;
  }

  result.maxAgeSeconds = sMaxage ?? maxAge;
  return result;
}

/**
 * Cache-Control ヘッダーと現在時刻から「次回フェッチ可能時刻（unix ms）」を算出する。
 * - no-store / no-cache / must-revalidate のとき: null（毎回サーバーへ問い合わせが必要なためスキップ不可）
 * - max-age / s-maxage が有効値のとき: now + clamp(N, MIN, MAX) * 1000
 * - max-age が欠落のとき: null（通常どおり条件付き GET に任せる）
 */
export function computeNextFetchEarliestAt(
  headerValue: string | null | undefined,
  nowMs: number,
): number | null {
  const directives = parseCacheControl(headerValue);
  // no-store / no-cache / must-revalidate はサーバー検証必須指示。
  // スキップすると ETag/Last-Modified の 304 検証すら送れず、サーバー側の意図に反する。
  if (directives.noStore || directives.mustRevalidate) return null;
  if (directives.maxAgeSeconds === null) return null;
  const clamped = Math.min(
    Math.max(directives.maxAgeSeconds, CACHE_CONTROL_MIN_SECONDS),
    CACHE_CONTROL_MAX_SECONDS,
  );
  return nowMs + clamped * 1000;
}
