/**
 * proxy-error-headers spec (#856)
 *
 * `applyProxyErrorDetailHeaders` の 4 field × set/unset の純粋関数仕様。
 * image-error-placeholder.ts / video-error-placeholder.ts の 8 行重複を
 * 集約した helper の挙動を、prefix を引数化したまま既存 2 ファイルの
 * semantics を完全に保つことを spec で固定する:
 *
 * - `upstreamStatus` / `bodySize`: `!== undefined` 判定 (0 / 200 も付与)
 * - `upstreamContentType` / `detectedMime`: truthy 判定 (空文字列は除外)
 */
import { describe, it, expect } from "vitest";
import { applyProxyErrorDetailHeaders } from "./proxy-error-headers";

describe("applyProxyErrorDetailHeaders", () => {
  it("details が undefined なら何も付与しない", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Image-Proxy", undefined);
    expect(headers).toEqual({});
  });

  it("upstreamStatus を文字列化して X-${prefix}-Upstream-Status に付与する", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Image-Proxy", { upstreamStatus: 403 });
    expect(headers["X-Image-Proxy-Upstream-Status"]).toBe("403");
  });

  it("upstreamStatus が undefined なら X-${prefix}-Upstream-Status を付与しない", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Image-Proxy", {});
    expect(headers["X-Image-Proxy-Upstream-Status"]).toBeUndefined();
  });

  it("upstreamContentType を X-${prefix}-Upstream-Type に付与する", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Video-Proxy", {
      upstreamContentType: "text/html",
    });
    expect(headers["X-Video-Proxy-Upstream-Type"]).toBe("text/html");
  });

  it("upstreamContentType が undefined / 空文字列なら X-${prefix}-Upstream-Type を付与しない", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Video-Proxy", { upstreamContentType: "" });
    expect(headers["X-Video-Proxy-Upstream-Type"]).toBeUndefined();
  });

  it("detectedMime を X-${prefix}-Detected-Mime に付与する", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Image-Proxy", { detectedMime: "image/webp" });
    expect(headers["X-Image-Proxy-Detected-Mime"]).toBe("image/webp");
  });

  it("detectedMime が undefined / 空文字列なら X-${prefix}-Detected-Mime を付与しない", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Image-Proxy", { detectedMime: "" });
    expect(headers["X-Image-Proxy-Detected-Mime"]).toBeUndefined();
  });

  it("bodySize を文字列化して X-${prefix}-Body-Size に付与する (0 も明示的に付与)", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Video-Proxy", { bodySize: 0 });
    expect(headers["X-Video-Proxy-Body-Size"]).toBe("0");

    const headers2: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers2, "Video-Proxy", { bodySize: 12345 });
    expect(headers2["X-Video-Proxy-Body-Size"]).toBe("12345");
  });

  it("bodySize が undefined なら X-${prefix}-Body-Size を付与しない", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Video-Proxy", {});
    expect(headers["X-Video-Proxy-Body-Size"]).toBeUndefined();
  });

  it("全 field 指定で 4 ヘッダーを prefix 通り付与する (既存 image-proxy 出力との互換性)", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Image-Proxy", {
      upstreamStatus: 200,
      upstreamContentType: "video/mp4",
      detectedMime: "video/webm",
      bodySize: 12345,
    });
    expect(headers).toEqual({
      "X-Image-Proxy-Upstream-Status": "200",
      "X-Image-Proxy-Upstream-Type": "video/mp4",
      "X-Image-Proxy-Detected-Mime": "video/webm",
      "X-Image-Proxy-Body-Size": "12345",
    });
  });

  it("prefix を Video-Proxy にすると X-Video-Proxy-* prefix で出力する (既存 video-proxy 出力との互換性)", () => {
    const headers: Record<string, string> = {};
    applyProxyErrorDetailHeaders(headers, "Video-Proxy", {
      upstreamStatus: 502,
      upstreamContentType: "text/html",
      detectedMime: "text/html",
      bodySize: 0,
    });
    expect(headers).toEqual({
      "X-Video-Proxy-Upstream-Status": "502",
      "X-Video-Proxy-Upstream-Type": "text/html",
      "X-Video-Proxy-Detected-Mime": "text/html",
      "X-Video-Proxy-Body-Size": "0",
    });
  });
});
