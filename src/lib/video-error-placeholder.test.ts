/**
 * video-error-placeholder spec (#751)
 *
 * image-proxy の `errorImageSvg` pattern を mirror した `errorVideoResponse` の
 * X-Video-Proxy-* ヘッダー + status code の TDD 仕様。
 */
import { describe, it, expect } from "vitest";
import { errorVideoResponse } from "./video-error-placeholder";

describe("errorVideoResponse", () => {
  it("常に X-Video-Proxy-Error ヘッダーを含む", () => {
    const res = errorVideoResponse("network");
    expect(res.headers.get("X-Video-Proxy-Error")).toBe("network");
  });

  it("body は null (video element は SVG 表示不可なので)", async () => {
    const res = errorVideoResponse("not_found");
    expect(res.body).toBeNull();
  });

  it("reason ごとに適切な HTTP status を返す", () => {
    expect(errorVideoResponse("not_found").status).toBe(404);
    expect(errorVideoResponse("bot_blocked").status).toBe(403);
    expect(errorVideoResponse("network").status).toBe(502);
    expect(errorVideoResponse("unavailable").status).toBe(502);
    expect(errorVideoResponse("too_large").status).toBe(413);
    expect(errorVideoResponse("size_unknown").status).toBe(413);
    expect(errorVideoResponse("mime_rejected").status).toBe(415);
    expect(errorVideoResponse("content_type_mismatch").status).toBe(415);
  });

  it("details が無ければ optional ヘッダーは付与しない", () => {
    const res = errorVideoResponse("network");
    expect(res.headers.get("X-Video-Proxy-Upstream-Status")).toBeNull();
    expect(res.headers.get("X-Video-Proxy-Upstream-Type")).toBeNull();
    expect(res.headers.get("X-Video-Proxy-Detected-Mime")).toBeNull();
    expect(res.headers.get("X-Video-Proxy-Body-Size")).toBeNull();
  });

  it("upstreamStatus を文字列化して返す", () => {
    const res = errorVideoResponse("bot_blocked", { upstreamStatus: 403 });
    expect(res.headers.get("X-Video-Proxy-Upstream-Status")).toBe("403");
  });

  it("upstreamContentType を返す", () => {
    const res = errorVideoResponse("mime_rejected", {
      upstreamStatus: 200,
      upstreamContentType: "text/html",
    });
    expect(res.headers.get("X-Video-Proxy-Upstream-Type")).toBe("text/html");
    expect(res.headers.get("X-Video-Proxy-Upstream-Status")).toBe("200");
  });

  it("detectedMime と bodySize を返す", () => {
    const res = errorVideoResponse("content_type_mismatch", {
      upstreamStatus: 200,
      upstreamContentType: "video/mp4",
      detectedMime: "video/webm",
      bodySize: 12345,
    });
    expect(res.headers.get("X-Video-Proxy-Detected-Mime")).toBe("video/webm");
    expect(res.headers.get("X-Video-Proxy-Body-Size")).toBe("12345");
  });

  it("bodySize 0 (空ボディ) も明示的に付与する (undefined check で誤って除外しない)", () => {
    const res = errorVideoResponse("unavailable", { bodySize: 0 });
    expect(res.headers.get("X-Video-Proxy-Body-Size")).toBe("0");
  });
});
