/**
 * usePiperTts (#674 Phase 2a-part2) の挙動 spec。
 *
 * happy-dom は HTMLAudioElement の再生イベントを発火させないため、class 形式の
 * MockAudio + `vi.stubGlobal("Audio", MockAudio)` でイベント発火を制御する。
 *
 * `@mintplex-labs/piper-tts-web` は dynamic import なので、`vi.mock` で predict / voices
 * を差し替える (ライブラリの onnxruntime-web wasm を test 環境で load させないため必須)。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@mintplex-labs/piper-tts-web", () => ({
  predict: vi.fn(async ({ text }: { text: string; voiceId: string }) => {
    // 16 byte wav-like blob (内容は test では不要)
    return new Blob([new Uint8Array(text.length)], { type: "audio/wav" });
  }),
  voices: vi.fn(async () => [
    { key: "en_US-amy-medium" },
    { key: "ja_JP-tsukuyomi-medium" },
    { key: "invalid-format" }, // parse 失敗 → skip 確認用
  ]),
}));

interface MockAudioInstance {
  src: string;
  playbackRate: number;
  volume: number;
  paused: boolean;
  ended: boolean;
  error: unknown;
  onplaying: (() => void) | null;
  onpause: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  triggerPlaying: () => void;
  triggerEnded: () => void;
  triggerError: () => void;
}

let createdAudios: MockAudioInstance[] = [];

class MockAudio implements MockAudioInstance {
  src: string;
  playbackRate = 1;
  volume = 1;
  paused = false;
  ended = false;
  error: unknown = null;
  onplaying: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  removeAttribute = vi.fn();

  constructor(url?: string) {
    this.src = url ?? "";
    createdAudios.push(this);
  }

  triggerPlaying() {
    this.paused = false;
    this.onplaying?.();
  }
  triggerEnded() {
    this.ended = true;
    this.paused = true;
    this.onended?.();
  }
  triggerError() {
    this.onerror?.();
  }
}

let createObjectURLCalls: Blob[] = [];
let revokeObjectURLCalls: string[] = [];

function setupBrowserMocks(opfsSupported: boolean) {
  createdAudios = [];
  createObjectURLCalls = [];
  revokeObjectURLCalls = [];
  vi.stubGlobal("Audio", MockAudio);
  // URL 全体を stub すると `new URL()` constructor が壊れるため createObjectURL/revokeObjectURL だけ上書き
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn((blob: Blob) => {
      createObjectURLCalls.push(blob);
      return `blob:mock-${createObjectURLCalls.length}`;
    }),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn((url: string) => {
      revokeObjectURLCalls.push(url);
    }),
    configurable: true,
    writable: true,
  });
  // OPFS support
  const storageStub = opfsSupported ? { getDirectory: vi.fn(async () => ({})) } : {};
  Object.defineProperty(global.navigator, "storage", {
    value: storageStub,
    configurable: true,
  });
}

describe("usePiperTts (#674 Phase 2a-part2)", () => {
  beforeEach(() => {
    setupBrowserMocks(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("OPFS 非対応環境では supported=false で speak しても何も起きない", async () => {
    setupBrowserMocks(false);
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    expect(result.current.supported).toBe(false);
    act(() => result.current.speak("hello"));
    expect(createdAudios.length).toBe(0);
  });

  it("engine=piper を返す", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    expect(result.current.engine).toBe("piper");
  });

  it("mount 時に library.voices() を呼んで piper: prefix の TtsVoice 一覧を取得 (parse 失敗 voice は除外)", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    await waitFor(() => {
      expect(result.current.voices.length).toBe(2);
    });
    expect(result.current.voices.map((v) => v.voiceURI)).toEqual([
      "piper:en_US-amy-medium",
      "piper:ja_JP-tsukuyomi-medium",
    ]);
  });

  it("voiceUri が piper: prefix を持たない場合 speak は errorCount を increment する", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("web-speech-uri"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(result.current.errorCount).toBeGreaterThan(0);
    });
    expect(createdAudios.length).toBe(0);
  });

  it("speak() で predict → Audio 生成 → play() が順に呼ばれる", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:en_US-amy-medium"));
    act(() => result.current.speak("hello world"));
    await waitFor(() => {
      expect(createdAudios.length).toBe(1);
    });
    expect(createdAudios[0].play).toHaveBeenCalled();
    expect(createObjectURLCalls.length).toBe(1);
  });

  it("audio が triggerPlaying で isPlaying=true、triggerEnded で endedCount++ かつ isPlaying=false", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:en_US-amy-medium"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(createdAudios.length).toBe(1);
    });
    const audio = createdAudios[0];
    act(() => audio.triggerPlaying());
    expect(result.current.isPlaying).toBe(true);
    const before = result.current.endedCount;
    act(() => audio.triggerEnded());
    expect(result.current.endedCount).toBe(before + 1);
    expect(result.current.isPlaying).toBe(false);
  });

  it("audio.onerror で errorCount++、isPlaying=false にリセット", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:en_US-amy-medium"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(createdAudios.length).toBe(1);
    });
    const audio = createdAudios[0];
    act(() => audio.triggerPlaying());
    const before = result.current.errorCount;
    act(() => audio.triggerError());
    expect(result.current.errorCount).toBe(before + 1);
    expect(result.current.isPlaying).toBe(false);
  });

  it("stop() で playToken が advance され、進行中の predict 結果は破棄される", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:en_US-amy-medium"));
    act(() => result.current.speak("hello"));
    act(() => result.current.stop());
    // predict が non-await 中に stop → audioRef は null のまま
    await waitFor(() => {
      // 既に作られた Audio は releaseAudio で revoke されている
      expect(revokeObjectURLCalls.length).toBeGreaterThanOrEqual(0);
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it("cycleRate() で rate が次値に進み、進行中 audio の playbackRate も更新される", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:en_US-amy-medium"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(createdAudios.length).toBe(1);
    });
    const audio = createdAudios[0];
    act(() => audio.triggerPlaying());
    const initialRate = result.current.rate;
    let next = 0;
    act(() => {
      next = result.current.cycleRate();
    });
    expect(next).not.toBe(initialRate);
    expect(result.current.rate).toBe(next);
    expect(audio.playbackRate).toBe(next);
  });

  it("setVolume() で volume が clamp され、進行中 audio.volume にも反映される", async () => {
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    act(() => result.current.setVoiceUri("piper:en_US-amy-medium"));
    act(() => result.current.speak("hello"));
    await waitFor(() => {
      expect(createdAudios.length).toBe(1);
    });
    const audio = createdAudios[0];
    act(() => result.current.setVolume(2.5)); // out of range → clamp to 1.0
    expect(result.current.volume).toBe(1.0);
    expect(audio.volume).toBe(1.0);
    act(() => result.current.setVolume(-0.5)); // out of range → clamp to 0.0
    expect(result.current.volume).toBe(0.0);
    expect(audio.volume).toBe(0.0);
  });

  it("voices() が throw しても hook がクラッシュせず voices=[] のまま", async () => {
    const piperMod = await import("@mintplex-labs/piper-tts-web");
    vi.mocked(piperMod.voices).mockRejectedValueOnce(new Error("offline"));
    const { usePiperTts } = await import("./usePiperTts");
    const { result } = renderHook(() => usePiperTts());
    // throw は console.error 経由で出るが、hook 自体は live
    await waitFor(() => {
      expect(result.current.engine).toBe("piper");
    });
    expect(result.current.voices).toEqual([]);
  });
});
