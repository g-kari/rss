// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/image-proxy/route";
import { cachePutAsync, deleteCfCache, matchCfCache } from "./cache-helper";
import { MAX_SVG_BYTES } from "./svg-image";

vi.mock("./server-auth", () => ({
  withBinarySession: (
    _request: Request,
    handler: (args: { ctx: Pick<ExecutionContext, "waitUntil"> }) => Promise<Response>,
  ) => handler({ ctx: { waitUntil: vi.fn() } }),
}));
vi.mock("./cache-helper", () => ({
  buildCacheKey: vi.fn(async () => new Request("https://rss.example.com/cache")),
  matchCfCache: vi.fn(),
  cachePutAsync: vi.fn(),
  deleteCfCache: vi.fn(),
}));

const request = () =>
  new Request(
    "https://rss.example.com/api/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Flogo.svg",
    {
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Dest": "image",
      },
    },
  );
const unsafe =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)"><script>alert(1)</script><path d="M0 0 L100 100"/></svg>';
const svgResponse = (source = unsafe) =>
  new Response(source, { headers: { "Content-Type": "image/svg+xml" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(matchCfCache).mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => svgResponse()),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sanitized SVG image proxy", () => {
  it.each(["MISS", "HIT"])(
    "sanitizes %s and always applies image isolation headers",
    async (cache) => {
      if (cache === "HIT") vi.mocked(matchCfCache).mockResolvedValue(svgResponse());
      const result = await GET(request());
      expect(result.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(result.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
      expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(result.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
      expect(result.headers.get("X-Cache")).toBe(cache);
      const body = await result.text();
      expect(body).toContain('<path d="M0 0 L100 100">');
      expect(body).not.toMatch(/script|onload|alert/);
      if (cache === "MISS") {
        expect(await vi.mocked(cachePutAsync).mock.calls[0][1].text()).toBe(body);
      } else expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("invalidates a poisoned cached MIME instead of serving it", async () => {
    vi.mocked(matchCfCache).mockResolvedValue(
      new Response(unsafe, { headers: { "Content-Type": "image/png" } }),
    );
    const result = await GET(request());
    expect(deleteCfCache).toHaveBeenCalledOnce();
    expect(result.headers.get("X-Cache")).toBe("MISS");
  });

  it("rejects forged SVG HTML and does not cache it", async () => {
    vi.mocked(fetch).mockResolvedValue(svgResponse("<html><script>alert(1)</script></html>"));
    const result = await GET(request());
    expect(result.headers.get("X-Image-Proxy-Error")).toBe("content_type_mismatch");
    expect(cachePutAsync).not.toHaveBeenCalled();
  });

  it("cancels an oversized declared SVG before reading the stream", async () => {
    const cancel = vi.fn();
    const pull = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(new ReadableStream({ cancel, pull }, { highWaterMark: 0 }), {
        headers: { "Content-Type": "image/svg+xml", "Content-Length": String(MAX_SVG_BYTES + 1) },
      }),
    );
    const result = await GET(request());
    expect(result.headers.get("X-Image-Proxy-Error")).toBe("too_large");
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(cachePutAsync).not.toHaveBeenCalled();
  });

  it("keeps direct navigation and cross-origin access blocked", async () => {
    for (const headers of [
      { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate" },
      { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors" },
    ]) {
      const result = await GET(new Request(request().url, { headers }));
      expect(result.status).toBe(403);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
