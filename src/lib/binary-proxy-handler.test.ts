/**
 * binary-proxy-handler cache MIME 再検証 spec (#853 security 案 B)
 *
 * `handleBinaryProxy` の cache get 直後における MIME magic-byte 再検証の TDD 仕様。
 *
 * cache poisoning 防御シナリオ:
 * 1. 攻撃者 controlled URL の upstream が初回 fetch 時は正規 image を返す
 * 2. cache に保存される
 * 3. attacker が upstream を更新して JS / HTML を返す MIME に切替
 * 4. 別 user が cache hit を踏む → 既存実装では poisoned content が表示される
 *
 * 本 spec は cache get 直後に `options.detectMimeType` で magic byte 再検証し、
 * mismatch なら cache 即時削除 + upstream 再 fetch にフォールバックする挙動を固定する。
 *
 * 発火タイミング: cache get 直後 (response 構築前) — デフォルト判断
 * cache invalidate ロジック: 即時削除 — デフォルト判断
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sec-Fetch-* は browser fetch spec で forbidden header と扱われ、happy-dom 環境では
// `new Request(url, { headers: { 'sec-fetch-site': 'same-origin' }})` で stripping される。
// `isSameOriginImageRequest` の挙動は #493 / proxy-error-headers test 等で別途固定済みのため、
// 本 spec ではモジュールレベルで stub し、cache MIME 再検証フローの観測に集中する。
vi.mock("@/lib/image-proxy-security", () => ({
  isSameOriginImageRequest: () => true,
  isContentTypeConsistent: () => true,
}));

import { handleBinaryProxy, type BinaryProxyOptions } from "./binary-proxy-handler";

// PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// HTML 風の poisoned payload (先頭が image magic でない)
const POISONED_HTML_BYTES = new TextEncoder().encode("<html><script>alert(1)</script></html>");

const ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * テスト用 cache stub。`caches.default` を差し替えて cache match / delete /
 * put の呼び出しを観測 + 制御する。
 */
function installCacheStub(initial: Response | null = null) {
  const state: { entry: Response | null } = { entry: initial };
  const deleteSpy = vi.fn(async (_key: Request) => {
    const had = state.entry !== null;
    state.entry = null;
    return had;
  });
  const matchSpy = vi.fn(async (_key: Request) => state.entry ?? undefined);
  const putSpy = vi.fn(async (_key: Request, res: Response) => {
    state.entry = res;
  });
  const stub = {
    default: {
      match: matchSpy,
      delete: deleteSpy,
      put: putSpy,
    },
  };
  // Workers runtime の caches global を差し替え (happy-dom 環境では未定義のため代入で OK)
  (globalThis as unknown as { caches: typeof stub }).caches = stub;
  return { matchSpy, deleteSpy, putSpy, state };
}

/**
 * `image/png` を期待する mock options を生成する。
 * `detectMimeType` は magic byte 先頭 4 byte で PNG / non-PNG を判定するスタブ。
 */
function makeImageOptions(): BinaryProxyOptions<"mime_rejected" | "content_type_mismatch"> & {
  detectMimeType: ReturnType<typeof vi.fn>;
} {
  const detectMimeType = vi.fn((bytes: Uint8Array): string | null => {
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    return null;
  });
  return {
    label: "test-image-proxy",
    cacheType: "image",
    cacheTtlSec: 3600,
    maxBytes: 1024 * 1024,
    maxBytesNoContentLength: 256 * 1024,
    acceptHeader: "image/*",
    defaultCacheContentType: "image/png",
    allowedContentTypes: ALLOWED_IMAGE_TYPES,
    detectMimeType,
    errorResponse: (reason) =>
      new Response(null, { status: 415, headers: { "X-Test-Error": reason } }),
    reasonMap: {
      notFound: "mime_rejected",
      botBlocked: "mime_rejected",
      unavailable: "mime_rejected",
      mimeRejected: "mime_rejected",
      tooLarge: "mime_rejected",
      sizeUnknown: "mime_rejected",
      contentTypeMismatch: "content_type_mismatch",
      network: "mime_rejected",
    },
  };
}

/** 同一オリジン image proxy リクエストを偽装。`isSameOriginImageRequest` は上で mock 済み */
function makeProxyRequest(targetUrl: string): Request {
  return new Request(
    `https://rss.example.com/api/image-proxy?url=${encodeURIComponent(targetUrl)}`,
  );
}

/** ExecutionContext.waitUntil の最小スタブ (cachePutAsync で利用) */
function makeCtx(): ExecutionContext {
  return {
    waitUntil: (_p: Promise<unknown>) => undefined,
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
}

describe("handleBinaryProxy — cache get 直後の MIME 再検証 (#853)", () => {
  let originalCaches: unknown;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCaches = (globalThis as { caches?: unknown }).caches;
  });

  afterEach(() => {
    (globalThis as { caches?: unknown }).caches = originalCaches as never;
    fetchSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  it("(a) cache HIT + MIME match → cache 削除せず即返却し upstream fetch しない", async () => {
    const cached = new Response(PNG_BYTES, {
      headers: { "Content-Type": "image/png" },
    });
    const { matchSpy, deleteSpy } = installCacheStub(cached);
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("upstream fetch should not be called on cache HIT + match");
    });

    const options = makeImageOptions();
    const res = await handleBinaryProxy(
      makeProxyRequest("https://example.com/safe.png"),
      makeCtx(),
      options,
    );

    expect(matchSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(options.detectMimeType).toHaveBeenCalledTimes(1);
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(PNG_BYTES);
  });

  it("(b) cache HIT + MIME mismatch → cache 即時削除 + upstream 再 fetch にフォールバック", async () => {
    // 攻撃者が cache に poisoned content を仕込んだシナリオ
    const poisoned = new Response(POISONED_HTML_BYTES, {
      headers: { "Content-Type": "image/png" }, // header は image/png を詐称
    });
    const { matchSpy, deleteSpy } = installCacheStub(poisoned);

    // upstream は安全な PNG を返す (=invalidate 後の re-fetch で得られる正規 content)
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(PNG_BYTES, {
          status: 200,
          headers: { "content-type": "image/png", "content-length": String(PNG_BYTES.length) },
        }),
    );

    const options = makeImageOptions();
    const res = await handleBinaryProxy(
      makeProxyRequest("https://attacker.example.com/poisoned.png"),
      makeCtx(),
      options,
    );

    expect(matchSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledTimes(1); // cache 即時削除
    expect(fetchSpy).toHaveBeenCalledTimes(1); // upstream 再 fetch
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("MISS"); // 再 fetch 経路なので MISS
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(PNG_BYTES);
  });

  it("(c) cache MISS → 通常の upstream fetch 経路、cache delete は呼ばれない", async () => {
    const { matchSpy, deleteSpy } = installCacheStub(null);

    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(PNG_BYTES, {
          status: 200,
          headers: { "content-type": "image/png", "content-length": String(PNG_BYTES.length) },
        }),
    );

    const options = makeImageOptions();
    const res = await handleBinaryProxy(
      makeProxyRequest("https://example.com/fresh.png"),
      makeCtx(),
      options,
    );

    expect(matchSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});
