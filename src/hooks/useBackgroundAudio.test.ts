/**
 * useBackgroundAudio (#745 Phase A + Phase D) の挙動 spec
 *
 * Phase D: Android Chrome の通知欄に「再生中」コントロールを表示するため、
 * HTML `<audio>` 要素 (無音 WAV data URI, loop=true) を Primary として追加。
 * WebAudio oscillator は HTML audio が使えない環境向けの Fallback として保持。
 *
 * テスト戦略:
 * - HTML Audio: happy-dom は Audio を提供するため MockAudio class で stub して検証
 * - WebAudio: happy-dom は AudioContext を提供しないため MockAudioContext を stub して検証
 *
 * 注: `vi.fn(() => obj)` を `new` で呼ぶと this binding が崩れて return が無視される
 * ことがあるため、必ず class 形式で mock を構築する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBackgroundAudio } from "./useBackgroundAudio";

interface MockOscillator {
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}
interface MockGain {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
}

let createdContexts: MockAudioContext[] = [];
let createdOscillators: MockOscillator[] = [];
let createdGains: MockGain[] = [];
let createdAudios: MockAudio[] = [];

class MockAudio {
  src: string;
  loop = false;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();

  constructor(src?: string) {
    this.src = src ?? "";
    createdAudios.push(this);
  }
}

class MockAudioContext {
  destination = {};
  close = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
  resume = vi.fn(() => Promise.resolve());

  constructor() {
    createdContexts.push(this);
  }

  createOscillator(): MockOscillator {
    const osc: MockOscillator = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    createdOscillators.push(osc);
    return osc;
  }

  createGain(): MockGain {
    const gain: MockGain = {
      gain: { value: 1 }, // default; hook が 0 に書き換える
      connect: vi.fn(),
    };
    createdGains.push(gain);
    return gain;
  }
}

describe("useBackgroundAudio (#745 Phase D — HTML audio Primary)", () => {
  beforeEach(() => {
    createdContexts = [];
    createdOscillators = [];
    createdGains = [];
    createdAudios = [];
    vi.stubGlobal("Audio", MockAudio);
    vi.stubGlobal("AudioContext", MockAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("active=true で HTML audio 要素を生成して play() を呼ぶ", () => {
    renderHook(() => useBackgroundAudio(true));
    expect(createdAudios.length).toBe(1);
    expect(createdAudios[0].play).toHaveBeenCalledOnce();
  });

  it("active=true で audio.loop が true に設定される", () => {
    renderHook(() => useBackgroundAudio(true));
    expect(createdAudios[0].loop).toBe(true);
  });

  it("active=false なら HTML audio は生成されず play() も呼ばれない", () => {
    renderHook(() => useBackgroundAudio(false));
    // audio 要素が生成される前に active=false なら play 呼出なし
    const anyPlayed = createdAudios.some((a) => a.play.mock.calls.length > 0);
    expect(anyPlayed).toBe(false);
  });

  it("active=true → false で audio.pause() が呼ばれる", () => {
    const { rerender } = renderHook(({ active }) => useBackgroundAudio(active), {
      initialProps: { active: true },
    });
    expect(createdAudios.length).toBe(1);
    rerender({ active: false });
    expect(createdAudios[0].pause).toHaveBeenCalled();
  });

  it("unmount で audio.pause() が呼ばれる", () => {
    const { unmount } = renderHook(() => useBackgroundAudio(true));
    expect(createdAudios.length).toBe(1);
    unmount();
    expect(createdAudios[0].pause).toHaveBeenCalled();
  });
});

describe("useBackgroundAudio (#745 Phase A — WebAudio oscillator Fallback)", () => {
  beforeEach(() => {
    createdContexts = [];
    createdOscillators = [];
    createdGains = [];
    createdAudios = [];
    vi.stubGlobal("Audio", MockAudio);
    vi.stubGlobal("AudioContext", MockAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("active=false なら AudioContext を作成しない", () => {
    renderHook(() => useBackgroundAudio(false));
    expect(createdContexts.length).toBe(0);
  });

  it("active=true で AudioContext を 1 つ作成して OscillatorNode を起動する", () => {
    renderHook(() => useBackgroundAudio(true));
    expect(createdContexts.length).toBe(1);
    expect(createdOscillators.length).toBe(1);
    expect(createdOscillators[0].start).toHaveBeenCalledOnce();
  });

  it("gain は 0 (無音) に設定される", () => {
    renderHook(() => useBackgroundAudio(true));
    expect(createdGains[0].gain.value).toBe(0);
  });

  it("unmount で OscillatorNode を stop + AudioContext を close する", () => {
    const { unmount } = renderHook(() => useBackgroundAudio(true));
    unmount();
    expect(createdOscillators[0].stop).toHaveBeenCalledOnce();
    expect(createdContexts[0].close).toHaveBeenCalledOnce();
  });

  it("active=false → true 切替で AudioContext が新規作成される (lazy 生成)", () => {
    const { rerender } = renderHook(({ active }) => useBackgroundAudio(active), {
      initialProps: { active: false },
    });
    expect(createdContexts.length).toBe(0);
    rerender({ active: true });
    expect(createdContexts.length).toBe(1);
  });

  it("active=true → false 切替で AudioContext は close せず suspend する (perf optimization)", () => {
    const { rerender } = renderHook(({ active }) => useBackgroundAudio(active), {
      initialProps: { active: true },
    });
    expect(createdContexts.length).toBe(1);
    rerender({ active: false });
    expect(createdContexts[0].close).not.toHaveBeenCalled();
    expect(createdContexts[0].suspend).toHaveBeenCalled();
    expect(createdOscillators[0].stop).toHaveBeenCalled();
  });

  it("active false → true → false → true で AudioContext は 1 つだけ保持される (perf)", () => {
    const { rerender } = renderHook(({ active }) => useBackgroundAudio(active), {
      initialProps: { active: false },
    });
    rerender({ active: true });
    rerender({ active: false });
    rerender({ active: true });
    // AudioContext は 1 個だけ作成、suspend/resume で切替
    expect(createdContexts.length).toBe(1);
    expect(createdContexts[0].resume).toHaveBeenCalled();
  });

  it("active=true → false → true で同じ AudioContext を resume + 新 OscillatorNode を生成", () => {
    const { rerender } = renderHook(({ active }) => useBackgroundAudio(active), {
      initialProps: { active: true },
    });
    expect(createdOscillators.length).toBe(1); // 初回 oscillator
    rerender({ active: false });
    expect(createdOscillators[0].stop).toHaveBeenCalled();
    rerender({ active: true });
    // ctx は同じ、oscillator は新規 (stop した node は再 start 不可なので)
    expect(createdContexts.length).toBe(1);
    expect(createdOscillators.length).toBe(2);
  });
});
