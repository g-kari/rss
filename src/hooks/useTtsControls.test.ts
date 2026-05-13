import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../lib/storage";
import { useTtsControls } from "./useTtsControls";

// ─── localStorage mock ────────────────────────────────────────────────────────

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

// ─── テスト共通定数 ──────────────────────────────────────────────────────────

const rates = [0.5, 1.0, 1.5, 2.0] as const;
type Rate = (typeof rates)[number];

// ─── rate cycle ──────────────────────────────────────────────────────────────

describe("cycleRate", () => {
  it("rates 配列を循環して次の値に切り替える", () => {
    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    // 初期値は 1.0 (defaultRate)
    expect(result.current.rate).toBe(1.0);

    let next: number;
    act(() => {
      next = result.current.cycleRate();
    });
    // 1.0 の次は 1.5
    expect(next!).toBe(1.5);
    expect(result.current.rate).toBe(1.5);
  });

  it("cycleRate の結果を localStorage に永続化する", () => {
    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    act(() => {
      result.current.cycleRate();
    });

    expect(store.get(STORAGE_KEYS.TTS_RATE)).toBe("1.5");
  });

  it("cycleRate は onRateChange callback を呼ぶ", () => {
    const onRateChange = vi.fn();
    const { result } = renderHook(() =>
      useTtsControls<Rate>({ rates, defaultRate: 1.0, onRateChange }),
    );

    act(() => {
      result.current.cycleRate();
    });

    expect(onRateChange).toHaveBeenCalledTimes(1);
  });
});

// ─── setVoiceUri ─────────────────────────────────────────────────────────────

describe("setVoiceUri", () => {
  it("voiceUri を更新して onVoiceChange を呼ぶ", () => {
    const onVoiceChange = vi.fn();
    const { result } = renderHook(() =>
      useTtsControls<Rate>({ rates, defaultRate: 1.0, onVoiceChange }),
    );

    act(() => {
      result.current.setVoiceUri("voice://test");
    });

    expect(result.current.voiceUri).toBe("voice://test");
    expect(onVoiceChange).toHaveBeenCalledTimes(1);
  });

  it("voiceUri を localStorage に永続化する", () => {
    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    act(() => {
      result.current.setVoiceUri("voice://test");
    });

    expect(store.get(STORAGE_KEYS.TTS_VOICE_URI)).toBe("voice://test");
  });
});

// ─── setVoiceUriSilent ────────────────────────────────────────────────────────

describe("setVoiceUriSilent", () => {
  it("voiceUri を更新するが onVoiceChange は呼ばない (silent)", () => {
    const onVoiceChange = vi.fn();
    const { result } = renderHook(() =>
      useTtsControls<Rate>({ rates, defaultRate: 1.0, onVoiceChange }),
    );

    act(() => {
      result.current.setVoiceUriSilent("piper://test");
    });

    // state は更新される
    expect(result.current.voiceUri).toBe("piper://test");
    // callback は呼ばれない
    expect(onVoiceChange).not.toHaveBeenCalled();
  });

  it("setVoiceUriSilent は null を渡して voiceUri をクリアできる", () => {
    const onVoiceChange = vi.fn();
    const { result } = renderHook(() =>
      useTtsControls<Rate>({ rates, defaultRate: 1.0, onVoiceChange }),
    );

    // まず setVoiceUri で設定
    act(() => {
      result.current.setVoiceUri("voice://initial");
    });
    expect(result.current.voiceUri).toBe("voice://initial");
    expect(onVoiceChange).toHaveBeenCalledTimes(1);

    // silent reset
    act(() => {
      result.current.setVoiceUriSilent(null);
    });
    expect(result.current.voiceUri).toBeNull();
    // 2 回目は呼ばれない
    expect(onVoiceChange).toHaveBeenCalledTimes(1);
  });

  it("setVoiceUriSilent は localStorage に永続化する", () => {
    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    act(() => {
      result.current.setVoiceUriSilent("piper://test");
    });

    expect(store.get(STORAGE_KEYS.TTS_VOICE_URI)).toBe("piper://test");
  });
});

// ─── setVolume ────────────────────────────────────────────────────────────────

describe("setVolume", () => {
  it("volume をクランプして更新する (0.0 〜 1.0)", () => {
    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    act(() => {
      result.current.setVolume(0.7);
    });
    expect(result.current.volume).toBe(0.7);

    // 上限を超えた値はクランプされる
    act(() => {
      result.current.setVolume(2.0);
    });
    expect(result.current.volume).toBe(1.0);

    // 下限を下回る値はクランプされる
    act(() => {
      result.current.setVolume(-0.5);
    });
    expect(result.current.volume).toBe(0.0);
  });

  it("setVolume は localStorage に永続化する", () => {
    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    act(() => {
      result.current.setVolume(0.8);
    });

    expect(store.get(STORAGE_KEYS.TTS_VOLUME)).toBe("0.8");
  });

  it("setVolume は onVolumeChange callback を呼ぶ", () => {
    const onVolumeChange = vi.fn();
    const { result } = renderHook(() =>
      useTtsControls<Rate>({ rates, defaultRate: 1.0, onVolumeChange }),
    );

    act(() => {
      result.current.setVolume(0.5);
    });

    expect(onVolumeChange).toHaveBeenCalledTimes(1);
  });
});

// ─── xxxRef identity stability ────────────────────────────────────────────────

describe("ref identity stability", () => {
  it("rateRef / voiceUriRef / volumeRef は rerender をまたいで同一 reference を保つ", () => {
    const { result, rerender } = renderHook(() =>
      useTtsControls<Rate>({ rates, defaultRate: 1.0 }),
    );

    const firstRateRef = result.current.rateRef;
    const firstVoiceUriRef = result.current.voiceUriRef;
    const firstVolumeRef = result.current.volumeRef;

    // state を変化させて rerender をトリガーする
    act(() => {
      result.current.cycleRate();
    });
    rerender();

    expect(result.current.rateRef).toBe(firstRateRef);
    expect(result.current.voiceUriRef).toBe(firstVoiceUriRef);
    expect(result.current.volumeRef).toBe(firstVolumeRef);
  });

  it("rateRef.current は最新の rate 値を反映する", () => {
    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    act(() => {
      result.current.cycleRate(); // 1.5 になる
    });

    expect(result.current.rateRef.current).toBe(1.5);
  });
});

// ─── defaultRate fallback ─────────────────────────────────────────────────────

describe("defaultRate fallback", () => {
  it("localStorage に無効な rate 値が保存されていた場合は defaultRate を使う", () => {
    store.set(STORAGE_KEYS.TTS_RATE, "9.9"); // rates 配列に含まれない値

    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    expect(result.current.rate).toBe(1.0);
  });

  it("localStorage に有効な rate 値が保存されていた場合はその値を復元する", () => {
    store.set(STORAGE_KEYS.TTS_RATE, "1.5");

    const { result } = renderHook(() => useTtsControls<Rate>({ rates, defaultRate: 1.0 }));

    expect(result.current.rate).toBe(1.5);
  });
});
