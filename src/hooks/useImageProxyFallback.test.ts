import { act, renderHook } from "@testing-library/react";
import type { SyntheticEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useImageProxyFallback } from "./useImageProxyFallback";

const ORIGINAL_URL = "https://example.com/image.png";
const PROXY_URL = `/api/image-proxy?url=${encodeURIComponent(ORIGINAL_URL)}`;
const ALREADY_PROXIED = "/api/image-proxy?url=https%3A%2F%2Fother.example.com%2Fimg.jpg";

const mockEvent = {} as SyntheticEvent<HTMLImageElement>;

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
    expect(result.current.attempt).toBe(2);
    expect(result.current.src).toBe(srcAfterFirst);
  });

  it("既に proxy 形式の URL はフォールバックしない", () => {
    const { result } = renderHook(() => useImageProxyFallback(ALREADY_PROXIED));
    expect(result.current.src).toBe(ALREADY_PROXIED);
    act(() => {
      result.current.onError();
    });
    expect(result.current.attempt).toBe(2);
    expect(result.current.src).toBe(ALREADY_PROXIED);
  });

  describe("Phase 2-c: consumer pass-through (案 c)", () => {
    it("options.onLoad は load イベントで consumer に転送される", () => {
      const onLoad = vi.fn();
      const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL, { onLoad }));
      act(() => {
        result.current.onLoad(mockEvent);
      });
      expect(onLoad).toHaveBeenCalledWith(mockEvent);
      expect(onLoad).toHaveBeenCalledTimes(1);
    });

    it("options.onError は attempt 1 (fallback 継続中) では consumer に通知しない", () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL, { onError }));
      act(() => {
        result.current.onError(mockEvent);
      });
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.attempt).toBe(1);
    });

    it("options.onError は attempt 2 (諦め) に到達した時のみ呼ばれる", () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL, { onError }));
      act(() => {
        result.current.onError(mockEvent);
      });
      act(() => {
        result.current.onError(mockEvent);
      });
      expect(onError).toHaveBeenCalledWith(mockEvent);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(result.current.attempt).toBe(2);
    });

    it("既に proxied URL の場合 canFallback=false で attempt 0 → 2 直接遷移 + consumer 通知", () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useImageProxyFallback(ALREADY_PROXIED, { onError }));
      act(() => {
        result.current.onError(mockEvent);
      });
      expect(onError).toHaveBeenCalledWith(mockEvent);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(result.current.attempt).toBe(2);
    });

    it("event 引数なしで onError 呼出時は consumer 通知 skip (既存後方互換)", () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL, { onError }));
      act(() => {
        result.current.onError();
      });
      act(() => {
        result.current.onError();
      });
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.attempt).toBe(2);
    });

    it("options 未指定でも既存挙動が壊れない", () => {
      const { result } = renderHook(() => useImageProxyFallback(ORIGINAL_URL));
      expect(() => {
        act(() => {
          result.current.onLoad(mockEvent);
        });
        act(() => {
          result.current.onError(mockEvent);
        });
      }).not.toThrow();
    });
  });
});
