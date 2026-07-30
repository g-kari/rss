import { isValidFeedUrl } from "@/lib/url";

/** 外部 HTTP フェッチのデフォルトタイムアウト（ミリ秒）*/
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

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
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
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
    reader.cancel().catch(() => {});
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
): Promise<Uint8Array<ArrayBuffer>> {
  return readBodyBytesCore(body, maxBytes, false) as Promise<Uint8Array<ArrayBuffer>>;
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

/**
 * リダイレクトを安全に追跡する fetch ラッパー。
 * 各リダイレクト先を isValidFeedUrl で検証し、プライベート IP への
 * オープンリダイレクト経由 SSRF を防ぐ。
 * タイムアウト時は AbortError をスローする。
 */
export function fetchFollowSafeRedirects(
  url: string,
  init: Omit<RequestInit, "redirect">,
  timeoutMs: number,
): Promise<Response> {
  return withTimeout(timeoutMs, async (signal) => {
    let currentUrl = url;
    let redirectCount = 0;
    const visitedUrls = new Set<string>([url]);

    while (redirectCount < MAX_REDIRECTS) {
      const res = await fetch(currentUrl, {
        ...init,
        signal,
        redirect: "manual",
      });

      // 304 Not Modified はリダイレクトではなく「変更なし」を示す。
      // Location ヘッダーを持たないため、リダイレクト追跡の対象外としてそのまま返す。
      if (res.status === 304) return res;

      // 安全なリダイレクトコードのみ追跡する。
      // 300 (Multiple Choices) / 305 (Use Proxy, 廃止) / 306 (廃止) 等は除外。
      if (
        res.status === 301 ||
        res.status === 302 ||
        res.status === 303 ||
        res.status === 307 ||
        res.status === 308
      ) {
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
        if (visitedUrls.has(nextUrl)) {
          throw new Error(`Redirect loop detected: ${nextUrl}`);
        }
        visitedUrls.add(nextUrl);
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      return res;
    }
    throw new Error(`Too many redirects (>=${MAX_REDIRECTS})`);
  });
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
