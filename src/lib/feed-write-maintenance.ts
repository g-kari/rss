/** Operator-controlled ingestion pause. Missing defaults off; invalid configured values fail closed. */
export function isFeedWritesPaused(value: unknown): boolean {
  return (
    value !== undefined && !(typeof value === "string" && value.trim().toLowerCase() === "false")
  );
}

const PAUSE_MESSAGE = "Feed updates are temporarily paused for maintenance. Please retry later.";

export class FeedWritesPausedError extends Error {
  readonly code = "FEED_WRITES_PAUSED";
  constructor() {
    super(PAUSE_MESSAGE);
    this.name = "FeedWritesPausedError";
  }
}

/** Check before any binding access, including index repair on unchanged/cooldown feeds. */
export function assertFeedWritesAllowed(env: Pick<CloudflareEnv, "RSS_FEED_WRITES_PAUSED">): void {
  if (isFeedWritesPaused(env.RSS_FEED_WRITES_PAUSED)) throw new FeedWritesPausedError();
}

/**
 * Conservative path matching only: never rewrite the request forwarded to OpenNext.
 * Decode ASCII escapes even beside malformed UTF-8/percent escapes; normalize encoded
 * separators/dot segments too. Collapse nested %25 prefixes in one pass to avoid
 * quadratic rescans; any remaining decode also shortens the string.
 */
function maintenancePath(pathname: string): string {
  let path = pathname;
  for (;;) {
    const decoded = path.replace(/%(?:25)*([\da-f]{2})/gi, (_escape, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    if (decoded === path) break;
    path = decoded;
  }
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").toLowerCase().split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

/** Block new feed mutations before auth/route handlers can fetch or write anything. */
export function feedWriteMaintenanceResponse(
  request: Request,
  pauseValue: unknown,
): Response | null {
  if (!isFeedWritesPaused(pauseValue)) return null;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return null;
  const path = maintenancePath(new URL(request.url).pathname);
  const isFeedWrite = path === "/api/feeds" || path.startsWith("/api/feeds/");
  const isSeedWrite = path === "/api/test/seed" || path.startsWith("/api/test/seed/");
  if (!isFeedWrite && !isSeedWrite) return null;
  return Response.json(
    { error: PAUSE_MESSAGE, code: "FEED_WRITES_PAUSED", retryable: true },
    { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } },
  );
}
