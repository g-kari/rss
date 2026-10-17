// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/image-proxy/route";
import { buildCacheKey, cachePutAsync, matchCfCache } from "./cache-helper";
import { withBinarySession } from "./server-auth";

vi.mock("./server-auth", () => ({
  withBinarySession: vi.fn(
    (_request: Request, handler: (args: { ctx: ExecutionContext }) => Promise<Response>) =>
      handler({ ctx: { waitUntil: vi.fn() } as unknown as ExecutionContext }),
  ),
}));
vi.mock("./cache-helper", () => ({
  buildCacheKey: vi.fn(async () => new Request("https://reader.test/cache")),
  matchCfCache: vi.fn(),
  cachePutAsync: vi.fn(),
  deleteCfCache: vi.fn(),
}));

const target = "https://publisher.test/image.svg";
const headers = {
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Dest": "image",
};
function request(mode?: string, image = target) {
  const url = new URL("https://reader.test/api/image-proxy");
  url.searchParams.set("url", image);
  if (mode !== undefined) url.searchParams.set("error", mode);
  return new Request(url, { headers });
}
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/></svg>';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(matchCfCache).mockResolvedValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("image-proxy opt-in empty error response", () => {
  it.each([
    ["not_found", () => new Response(null, { status: 404 })],
    ["bot_blocked", () => new Response(null, { status: 403 })],
    ["unavailable", () => new Response(null, { status: 503 })],
    [
      "mime_rejected",
      () => new Response("not an image", { headers: { "Content-Type": "text/html" } }),
    ],
    [
      "content_type_mismatch",
      () => new Response("not an image", { headers: { "Content-Type": "image/png" } }),
    ],
    [
      "too_large",
      () =>
        new Response(null, {
          headers: { "Content-Type": "image/png", "Content-Length": "31457281" },
        }),
    ],
    [
      "size_unknown",
      () =>
        new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
          headers: { "Content-Type": "image/png" },
        }),
    ],
    [
      "network",
      () => {
        throw new TypeError("Synthetic transport failure");
      },
    ],
  ] as const)(
    "turns %s into an uncached empty 502 instead of a loadable SVG",
    async (reason, response) => {
      vi.mocked(fetch).mockImplementation(async () => response());
      const result = await GET(request("empty"));
      expect(result.status).toBe(502);
      expect(result.body).toBeNull();
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(result.headers.get("X-Image-Proxy-Error")).toBe(reason);
      expect(result.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
      expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(cachePutAsync).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, "svg", "EMPTY", "", "other"])(
    "preserves legacy SVG 200 for error=%s",
    async (mode) => {
      const result = await GET(request(mode));
      expect(result.status).toBe(200);
      expect(result.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(result.headers.get("Cache-Control")).toBe("public, max-age=3600");
      expect(await result.text()).toContain("<svg");
      expect(cachePutAsync).not.toHaveBeenCalled();
    },
  );

  it("does not mistake a query inside the upstream URL for the opt-in", async () => {
    expect((await GET(request(undefined, `${target}?error=empty`))).status).toBe(200);
  });

  it.each(["HIT", "MISS"])(
    "preserves sanitized SVG success and the shared success cache on %s",
    async (cache) => {
      const response = () => new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
      if (cache === "HIT") vi.mocked(matchCfCache).mockResolvedValue(response());
      else vi.mocked(fetch).mockImplementation(async () => response());
      const result = await GET(request("empty"));
      expect(result.status).toBe(200);
      expect(result.headers.get("X-Cache")).toBe(cache);
      expect(result.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
      expect(result.headers.get("Cache-Control")).toBe("public, max-age=2592000");
      expect(await result.text()).toContain("<rect");
      expect(buildCacheKey).toHaveBeenCalledWith("https://reader.test", "image", target);
      if (cache === "HIT") expect(fetch).not.toHaveBeenCalled();
      else expect(cachePutAsync).toHaveBeenCalledOnce();
    },
  );

  it.each(["HIT", "MISS"])("preserves raster success on %s", async (cache) => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = () => new Response(png, { headers: { "Content-Type": "image/png" } });
    if (cache === "HIT") vi.mocked(matchCfCache).mockResolvedValue(response());
    else vi.mocked(fetch).mockImplementation(async () => response());
    const result = await GET(request("empty"));
    expect(result.status).toBe(200);
    expect(result.headers.get("X-Cache")).toBe(cache);
    expect(result.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(png);
    expect(buildCacheKey).toHaveBeenCalledWith("https://reader.test", "image", target);
    if (cache === "HIT") expect(fetch).not.toHaveBeenCalled();
    else expect(cachePutAsync).toHaveBeenCalledOnce();
  });

  it("propagates session guard failures without entering the binary handler", async () => {
    vi.mocked(withBinarySession).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await GET(request("empty"))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(matchCfCache).not.toHaveBeenCalled();
  });

  it("preserves same-origin and URL security rejections before upstream fetch", async () => {
    expect((await GET(request("empty", "http://127.0.0.1/private"))).status).toBe(400);
    for (const overrides of [
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Mode": "navigate" },
    ]) {
      expect(
        (await GET(new Request(request("empty").url, { headers: { ...headers, ...overrides } })))
          .status,
      ).toBe(403);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(matchCfCache).not.toHaveBeenCalled();
  });
});
