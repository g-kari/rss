/**
 * usePiperTts (#761) の挙動 spec — piper-plus library 版。
 *
 * piper-plus と onnxruntime-web は dynamic import なので `vi.mock` で全 API を差し替える
 * (実際の wasm を test 環境で load させないため必須)。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const synthesizeMock = vi.fn();
const disposeMock = vi.fn();
const playMock = vi.fn(() => Promise.resolve());
const initializeMock = vi.fn();

vi.mock("piper-plus", () => ({
  PiperPlus: {
    initialize: (...args: unknown[]) => initializeMock(...args),
  },
}));

vi.mock("onnxruntime-web", () => ({
  env: { wasm: { wasmPaths: "" } },
}));

function resetMocks() {
  initializeMock.mockReset();
  synthesizeMock.mockReset();
  disposeMock.mockReset();
  playMock.mockReset();
  playMock.mockImplementation(() => Promise.resolve());

  initializeMock.mockImplementation(async () => ({
    synthesize: (...args: unknown[]) => synthesizeMock(...args),
    dispose: disposeMock,
  }));
  synthesizeMock.mockImplementation(async (text: string) => ({
    play: playMock,
    duration: text.length * 0.1,
    sampleRate: 22050,
    samples: new Float32Array(text.length * 100),
  }));
}

function setupBrowserMocks() {
  // AudioContext 存在判定 (hook の supported 判定で参照)
  // 実体は使わない (piper-plus 内部で AudioContext を使うが、play() は mock 化済み)
  if (typeof globalThis.AudioContext === "undefined") {
    Object.defineProperty(globalThis, "AudioContext", { value: class {}, configurable: true });
  }
}

describe("usePiperTts (#761 piper-plus)", () => {
  beforeEach(() => {
    resetMocks();
    setupBrowserMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("engine=piper を返す", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    expect(result.current.engine).toBe("piper");
  });

  it("voices は PIPER_PLUS_VOICES から導出 (tsukuyomi voice を含む)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    expect(result.current.voices.length).toBeGreaterThan(0);
    expect(result.current.voices.map((v) => v.voiceURI)).toContain("piper:tsukuyomi");
  });

  it("voiceUri が piper-plus に存在しないなら errorCount を increment + synthesize 呼ばれない", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:unknown-voice"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(result.current.errorCount).toBeGreaterThan(0);
    });
    expect(initializeMock).not.toHaveBeenCalled();
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("voiceUri が piper: prefix を持たない場合も errorCount を increment", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("web-speech-uri"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(result.current.errorCount).toBeGreaterThan(0);
    });
    expect(initializeMock).not.toHaveBeenCalled();
  });

  it("speak() で initialize → synthesize → play が順に呼ばれる", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("こんにちは"));
    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
    });
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(synthesizeMock).toHaveBeenCalledTimes(1);
    expect(synthesizeMock).toHaveBeenCalledWith(
      "こんにちは",
      expect.objectContaining({ language: "ja" }),
    );
  });

  it("同 voice の連続 speak は initialize を再呼出しない (instance 再利用)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("a"));
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(1));
    act(() => result.current.speak("b"));
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2));
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it("play() resolve 後に endedCount++ + isPlaying=false", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("こんにちは"));
    await waitFor(() => expect(result.current.endedCount).toBeGreaterThan(0));
    expect(result.current.isPlaying).toBe(false);
  });

  it("synthesize 失敗で errorCount++ + lastError=model-error", async () => {
    synthesizeMock.mockRejectedValueOnce(new Error("inference failed"));
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("error case"));
    await waitFor(() => {
      expect(result.current.errorCount).toBeGreaterThan(0);
    });
    expect(result.current.lastError).toBe("model-error");
  });

  it("synthesize fetch エラーは lastError=network", async () => {
    synthesizeMock.mockRejectedValueOnce(new Error("fetch failed (network)"));
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("error case"));
    await waitFor(() => expect(result.current.errorCount).toBeGreaterThan(0));
    expect(result.current.lastError).toBe("network");
  });

  it("play() NotAllowedError で lastError=not-allowed", async () => {
    const notAllowed = new Error("autoplay blocked");
    notAllowed.name = "NotAllowedError";
    playMock.mockRejectedValueOnce(notAllowed);
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("hello"));
    await waitFor(() => expect(result.current.errorCount).toBeGreaterThan(0));
    expect(result.current.lastError).toBe("not-allowed");
  });

  it("stop() で playToken が advance され、進行中 synthesize 結果は破棄される", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("hello"));
    act(() => result.current.stop());
    // 進行中の async は破棄される (token mismatch で early return)
    await waitFor(() => expect(result.current.isPlaying).toBe(false));
  });

  it("cycleRate() で rate が次値に進む (次 synthesize の lengthScale に反映)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    const initialRate = result.current.rate;
    let next = 0;
    act(() => {
      next = result.current.cycleRate();
    });
    expect(next).not.toBe(initialRate);
    expect(result.current.rate).toBe(next);
  });

  it("setVolume() で volume が clamp される (out of range)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVolume(2.5));
    expect(result.current.volume).toBe(1.0);
    act(() => result.current.setVolume(-0.5));
    expect(result.current.volume).toBe(0.0);
  });

  it("enabled=false なら speak は early return (initialize 呼ばれない)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts({ enabled: false }));
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("hello"));
    await new Promise((r) => setTimeout(r, 50));
    expect(initializeMock).not.toHaveBeenCalled();
  });
});
