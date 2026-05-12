/**
 * useBackgroundAudio (#745 Phase A) の挙動 spec
 *
 * happy-dom は WebAudio API を提供しないため、class 形式の MockAudioContext を
 * `vi.stubGlobal("AudioContext", MockAudioContext)` で注入し、active=true/false /
 * unmount / 切替時の cleanup を検証する。
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

describe("useBackgroundAudio (#745 Phase A)", () => {
  beforeEach(() => {
    createdContexts = [];
    createdOscillators = [];
    createdGains = [];
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
