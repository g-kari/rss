import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useImageProxyFallback } from "./useImageProxyFallback";

const ORIGINAL_URL = "https://example.com/image.png";
const PROXY_URL = `/api/image-proxy?url=${encodeURIComponent(ORIGINAL_URL)}`;
const ALREADY_PROXIED = "/api/image-proxy?url=https%3A%2F%2Fother.example.com%2Fimg.jpg";

describe("useImageProxyFallback", () => {
  it("初期状態で proxy URL を返す", () => {
    const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL));
    expect(result.current.src).toBe(PROXY_URL);
    expect(result.current.attempt).toBe(0);
  });

  it("onerror 1 回目で原 URL に切り替える", () => {
    const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL));
    act(() => {
      result.current.onError();
    });
    expect(result.current.src).toBe(ORIGINAL_URL);
    expect(result.current.attempt).toBe(1);
  });

  it("onerror 2 回目で src を変更しない (諦め)", () => {
    const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL));
    act(() => {
      result.current.onError();
    });
    const srcAfterFirst = result.current.src;
    act(() => {
      result.current.onError();
    });
    // attempt は 2 になるが src は原 URL のまま (proxied に戻らない)
    expect(result.current.attempt).toBe(2);
    // 既に原 URL なので canFallback=true の場合 attempt=2 でも src は originalUrl
    expect(result.current.src).toBe(srcAfterFirst);
  });

  it("既に proxy 形式の URL はフォールバックしない", () => {
    const { result } = renderHook(() => useImageProxyFallback(ALREADY_PROXIED));
    // 既に proxy URL → buildImageProxyUrl は同一 URL を返す → canFallback=false
    expect(result.current.src).toBe(ALREADY_PROXIED);
    act(() => {
      result.current.onError();
    });
    // フォールバック不可のため src は変わらない (attempt は 2 にスキップ)
    expect(result.current.attempt).toBe(2);
    expect(result.current.src).toBe(ALREADY_PROXIED);
  });
});
