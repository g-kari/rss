/**
 * usePiperTts (#761) の挙動 spec — piper-plus library 版。
 *
 * piper-plus と onnxruntime-web は dynamic import なので `vi.mock` で全 API を差し替える
 * (実際の wasm を test 環境で load させないため必須)。
 *
 * #766 修正: piper-plus AudioResult.play() を使わず、自前で AudioContext + BufferSourceNode で
 * 再生する設計に変更。テストも `playMock` → `class MockAudioContext` (BufferSourceNode の
 * start / onended を持つ) の mock に切替。class 形式 mock は `react-state-ref.md` の派生ケース
 * 「`new Ctor()` で呼ばれるブラウザ API は class 形式で mock」に準拠。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const synthesizeMock = vi.fn();
const synthesizeWithCloningMock = vi.fn();
const disposeMock = vi.fn();
const initializeMock = vi.fn();

vi.mock("piper-plus", () => ({
  PiperPlus: {
    initialize: (...args: unknown[]) => initializeMock(...args),
  },
}));

vi.mock("onnxruntime-web", () => ({
  env: { wasm: { wasmPaths: "" } },
}));

/**
 * BufferSourceNode の mock: start() で onended を非同期発火させて natural-end 経路を再現。
 * stop() 呼出後は onended が null に差し替えられる前提なので発火しない。
 */
type MockSource = {
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

let createdSources: MockSource[] = [];
let startErrorOnce: Error | null = null;
/**
 * true なら start() は natural-end (`source.onended`) を発火させない。
 * stop() の介入テストで race を避けるためのフラグ (stop 時に明示的に true 化)。
 */
let suppressNaturalEnd = false;

class MockAudioContext {
  state: "running" | "suspended" | "closed" = "running";
  destination = {} as AudioDestinationNode;

  constructor() {
    /* no-op */
  }

  createBuffer(_ch: number, length: number, sampleRate: number): AudioBuffer {
    return {
      length,
      sampleRate,
      duration: length / sampleRate,
      numberOfChannels: 1,
      copyToChannel: vi.fn(),
      copyFromChannel: vi.fn(),
      getChannelData: vi.fn(() => new Float32Array(length)),
    } as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source: MockSource = {
      buffer: null,
      onended: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(() => {
        if (startErrorOnce) {
          const err = startErrorOnce;
          startErrorOnce = null;
          throw err;
        }
        if (suppressNaturalEnd) return;
        // natural-end を queueMicrotask で即時非同期発火
        queueMicrotask(() => {
          source.onended?.();
        });
      }),
      stop: vi.fn(),
    };
    createdSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as GainNode;
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }

  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

function resetMocks() {
  initializeMock.mockReset();
  synthesizeMock.mockReset();
  synthesizeWithCloningMock.mockReset();
  disposeMock.mockReset();
  createdSources = [];
  startErrorOnce = null;
  suppressNaturalEnd = false;

  initializeMock.mockImplementation(async () => ({
    synthesize: (...args: unknown[]) => synthesizeMock(...args),
    synthesizeWithVoiceCloning: (...args: unknown[]) => synthesizeWithCloningMock(...args),
    dispose: disposeMock,
  }));
  const audioFactory = (text: string) => ({
    // play は使われない (自前 BufferSourceNode 再生に切替)
    play: vi.fn(() => Promise.resolve()),
    duration: text.length * 0.1,
    sampleRate: 22050,
    samples: new Float32Array(text.length * 100),
  });
  synthesizeMock.mockImplementation(async (text: string) => audioFactory(text));
  synthesizeWithCloningMock.mockImplementation(async (text: string) => audioFactory(text));
}

function setupBrowserMocks() {
  Object.defineProperty(globalThis, "AudioContext", {
    value: MockAudioContext,
    configurable: true,
    writable: true,
  });
}

describe("usePiperTts (#761 piper-plus / #766 自前 BufferSource 再生)", () => {
  beforeEach(() => {
    vi.resetModules(); // module-level singleton AudioContext / piperLibPromise を毎回 reset
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
    expect(synthesizeWithCloningMock).not.toHaveBeenCalled();
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

  it("speak() で initialize → synthesize → BufferSource.start が順に呼ばれる (tsukuyomi は voice cloning path)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("こんにちは"));
    await waitFor(() => {
      expect(createdSources.length).toBeGreaterThan(0);
      expect(createdSources[0].start).toHaveBeenCalled();
    });
    expect(initializeMock).toHaveBeenCalledTimes(1);
    // tsukuyomi は requiresSpeakerEmbedding: true → synthesizeWithVoiceCloning が呼ばれる
    expect(synthesizeWithCloningMock).toHaveBeenCalledTimes(1);
    expect(synthesizeMock).not.toHaveBeenCalled();
    const callArgs = synthesizeWithCloningMock.mock.calls[0];
    expect(callArgs[0]).toBe("こんにちは");
    expect(callArgs[1]).toBeInstanceOf(Float32Array);
    expect((callArgs[1] as Float32Array).length).toBe(256);
    expect((callArgs[1] as Float32Array).every((v) => v === 0)).toBe(true);
    expect(callArgs[2]).toMatchObject({ language: "ja" });
  });

  it("requiresSpeakerEmbedding なし voice (css10-ja) は通常 synthesize が呼ばれる", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:css10-ja"));
    act(() => result.current.speak("テスト"));
    await waitFor(() => expect(createdSources.length).toBeGreaterThan(0));
    expect(synthesizeMock).toHaveBeenCalledTimes(1);
    expect(synthesizeWithCloningMock).not.toHaveBeenCalled();
    expect(synthesizeMock).toHaveBeenCalledWith(
      "テスト",
      expect.objectContaining({ language: "ja" }),
    );
  });

  it("同 voice の連続 speak は initialize を再呼出しない (instance 再利用)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("a"));
    await waitFor(() => expect(result.current.endedCount).toBe(1));
    act(() => result.current.speak("b"));
    await waitFor(() => expect(result.current.endedCount).toBe(2));
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it("natural end (source.onended) で endedCount++ + isPlaying=false", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("こんにちは"));
    await waitFor(() => expect(result.current.endedCount).toBeGreaterThan(0));
    expect(result.current.isPlaying).toBe(false);
  });

  it("synthesize 失敗で errorCount++ + lastError=model-error", async () => {
    synthesizeWithCloningMock.mockRejectedValueOnce(new Error("inference failed"));
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
    synthesizeWithCloningMock.mockRejectedValueOnce(new Error("fetch failed (network)"));
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("error case"));
    await waitFor(() => expect(result.current.errorCount).toBeGreaterThan(0));
    expect(result.current.lastError).toBe("network");
  });

  it("source.start NotAllowedError で lastError=not-allowed (#766: autoplay policy)", async () => {
    const notAllowed = new Error("autoplay blocked");
    notAllowed.name = "NotAllowedError";
    startErrorOnce = notAllowed;
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("hello"));
    await waitFor(() => expect(result.current.errorCount).toBeGreaterThan(0));
    expect(result.current.lastError).toBe("not-allowed");
  });

  it("stop() で audioSource.stop が呼ばれて再生が確実に止まる (#766 主目的)", async () => {
    // natural-end 発火を抑制して stop() の介入を確実に検証
    suppressNaturalEnd = true;
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(createdSources.length).toBeGreaterThan(0);
      expect(createdSources[0].start).toHaveBeenCalled();
    });
    act(() => result.current.stop());
    // source.stop() が呼ばれて再生停止
    expect(createdSources[0].stop).toHaveBeenCalled();
    // onended は null セットされて natural-end 経路が発火しない (endedCount は increment しない)
    expect(createdSources[0].onended).toBeNull();
    await waitFor(() => expect(result.current.isPlaying).toBe(false));
    expect(result.current.endedCount).toBe(0);
  });

  it("stop() で playToken が advance され、進行中 synthesize 結果は破棄される", async () => {
    // synthesize を resolve 遅延させて stop の介入余地を作る
    synthesizeWithCloningMock.mockImplementationOnce(
      (text: string) =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                play: vi.fn(() => Promise.resolve()),
                duration: 1,
                sampleRate: 22050,
                samples: new Float32Array(100),
              }),
            10,
          );
        }),
    );
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("hello"));
    act(() => result.current.stop());
    // synthesize 解決後でも token mismatch で early return → source 作られない
    await new Promise((r) => setTimeout(r, 50));
    expect(createdSources.length).toBe(0);
    expect(result.current.isPlaying).toBe(false);
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

  it("#767 chunk 化: 複数 sentence の長文で synthesize が chunks.length 回呼ばれる", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    // 3 文 (3 sentences) のテキスト
    act(() => result.current.speak("最初の文。二番目の文。三番目の文。"));
    // 3 chunks すべて完了して endedCount=1 になるまで待つ
    await waitFor(() => expect(result.current.endedCount).toBe(1));
    // synthesizeWithVoiceCloning が 3 回呼ばれる (tsukuyomi は voice cloning path)
    expect(synthesizeWithCloningMock).toHaveBeenCalledTimes(3);
    expect(synthesizeWithCloningMock.mock.calls[0]![0]).toBe("最初の文。");
    expect(synthesizeWithCloningMock.mock.calls[1]![0]).toBe("二番目の文。");
    expect(synthesizeWithCloningMock.mock.calls[2]![0]).toBe("三番目の文。");
    // BufferSource は 3 回作られる
    expect(createdSources.length).toBe(3);
  });

  it("#767 chunk 化: stop() で chunks chain が中断される (残 chunks は synthesize されない)", async () => {
    suppressNaturalEnd = true; // natural-end 抑制で stop 介入を確実化
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("最初の文。二番目の文。三番目の文。"));
    // 最初の chunk が再生開始するまで待つ
    await waitFor(() => {
      expect(createdSources.length).toBeGreaterThan(0);
      expect(createdSources[0].start).toHaveBeenCalled();
    });
    act(() => result.current.stop());
    // stop 後に残 chunks が synthesize されないことを確認
    await new Promise((r) => setTimeout(r, 50));
    // 1 件のみ synthesize 呼ばれて打ち切られる (token mismatch で次 chunk 起動せず)
    expect(synthesizeWithCloningMock.mock.calls.length).toBeLessThan(3);
    // source.stop も呼ばれた
    expect(createdSources[0].stop).toHaveBeenCalled();
    expect(result.current.endedCount).toBe(0); // 全 chunks 完了していないので endedCount は 0
  });

  it("#767 chunk 化: 空テキスト / 空白のみは silent skip で endedCount++ (caller の auto-advance 継続)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:tsukuyomi"));
    act(() => result.current.speak("   "));
    await waitFor(() => expect(result.current.endedCount).toBe(1));
    // synthesize は呼ばれない
    expect(synthesizeWithCloningMock).not.toHaveBeenCalled();
    expect(createdSources.length).toBe(0);
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
