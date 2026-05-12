/**
 * useTtsEngineSetting (#674 Phase 2b) の spec。
 * localStorage 永続化と storage event 同期を検証。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTtsEngineSetting } from "./useTtsEngineSetting";
import { STORAGE_KEYS } from "../lib/storage";

/**
 * happy-dom の組込 localStorage が `--localstorage-file` 設定で機能不全のため、
 * 各 spec で Map ベースの mock を window.localStorage に inject する。
 */
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  store.clear();
});

describe("useTtsEngineSetting (#674 Phase 2b)", () => {
  it("初回 mount で localStorage 未設定なら web-speech (default)", () => {
    const { result } = renderHook(() => useTtsEngineSetting());
    expect(result.current.engine).toBe("web-speech");
  });

  it("localStorage に piper があれば piper を初期値として読み込む", () => {
    store.set(STORAGE_KEYS.TTS_ENGINE, "piper");
    const { result } = renderHook(() => useTtsEngineSetting());
    expect(result.current.engine).toBe("piper");
  });

  it("localStorage に不正値があれば web-speech に fallback", () => {
    store.set(STORAGE_KEYS.TTS_ENGINE, "invalid-engine");
    const { result } = renderHook(() => useTtsEngineSetting());
    expect(result.current.engine).toBe("web-speech");
  });

  it("setEngine で state と localStorage が両方更新される", () => {
    const { result } = renderHook(() => useTtsEngineSetting());
    act(() => result.current.setEngine("piper"));
    expect(result.current.engine).toBe("piper");
    expect(store.get(STORAGE_KEYS.TTS_ENGINE)).toBe("piper");
  });

  it("storage event (別タブからの変更) で engine が同期される", () => {
    const { result } = renderHook(() => useTtsEngineSetting());
    expect(result.current.engine).toBe("web-speech");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEYS.TTS_ENGINE,
          newValue: "piper",
        }),
      );
    });
    expect(result.current.engine).toBe("piper");
  });

  it("storage event で不正値が来たら無視 (現在の engine を維持)", () => {
    const { result } = renderHook(() => useTtsEngineSetting());
    act(() => result.current.setEngine("piper"));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEYS.TTS_ENGINE,
          newValue: "garbage",
        }),
      );
    });
    expect(result.current.engine).toBe("piper");
  });

  it("storage event で別の key の変化は無視", () => {
    const { result } = renderHook(() => useTtsEngineSetting());
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other-unrelated-key",
          newValue: "piper",
        }),
      );
    });
    expect(result.current.engine).toBe("web-speech");
  });

  it("setEngine の identity が render 間で安定 (useCallback deps=[])", () => {
    const { result, rerender } = renderHook(() => useTtsEngineSetting());
    const first = result.current.setEngine;
    rerender();
    expect(result.current.setEngine).toBe(first);
  });
});
