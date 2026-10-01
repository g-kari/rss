import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useImmersiveNarration } from "./useImmersiveNarration";
class Utterance {
  text: string;
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
  constructor(text: string) {
    this.text = text;
  }
}
const local = { voiceURI: "ja", name: "日本語", lang: "ja-JP", localService: true };
let voices: object[];
let current: Utterance;
const synth = {
  getVoices: vi.fn(() => voices),
  speak: vi.fn((u: Utterance) => {
    current = u;
  }),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  voices = [local];
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  return renderHook(
    ({ key, paused, visible }) => useImmersiveNarration(key, `記事 ${key}`, paused, visible, 1),
    { initialProps: { key: "a", paused: false, visible: true } },
  );
}
it("is silent until a click, uses only a local Japanese voice, pauses/resumes/stops and cleans up", () => {
  const { result, rerender, unmount } = setup();
  expect(synth.speak).not.toHaveBeenCalled();
  act(() => result.current.toggle());
  expect(synth.speak).toHaveBeenCalledOnce();
  expect(current).toMatchObject({ voice: local, lang: "ja-JP", rate: 1 });
  act(() => current.onstart?.());
  rerender({ key: "a", paused: true, visible: true });
  expect(synth.pause).toHaveBeenCalled();
  const resumes = synth.resume.mock.calls.length;
  rerender({ key: "a", paused: true, visible: false });
  rerender({ key: "a", paused: true, visible: true });
  expect(synth.resume).toHaveBeenCalledTimes(resumes);
  rerender({ key: "a", paused: false, visible: true });
  expect(synth.speak).toHaveBeenCalledOnce();
  expect(synth.resume.mock.calls.length).toBeGreaterThan(resumes);
  act(() => result.current.toggle());
  expect(synth.cancel).toHaveBeenCalledOnce();
  expect(result.current.holding).toBe(false);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels on navigation and ignores delayed events from old articles or after close", () => {
  const { result, rerender, unmount } = setup();
  act(() => result.current.toggle());
  const first = current;
  rerender({ key: "b", paused: false, visible: true });
  expect(synth.cancel).toHaveBeenCalledOnce();
  act(() => first.onend?.());
  expect(result.current.holding).toBe(true);
  act(() => current.onstart?.());
  act(() => current.onend?.());
  expect(result.current.holding).toBe(false);
  rerender({ key: "c", paused: false, visible: true });
  const last = current;
  unmount();
  act(() => last.onerror?.());
  expect(vi.getTimerCount()).toBe(0);
});
it("never sends text to remote or unclassified voices and safely releases timing on no voice or startup failure", () => {
  voices = [
    { ...local, localService: false },
    { ...local, localService: undefined },
  ];
  const { result } = setup();
  act(() => result.current.toggle());
  expect(synth.speak).not.toHaveBeenCalled();
  expect(result.current.holding).toBe(false);
  expect(result.current.message).toContain("端末内の音声");
  voices = [local];
  act(() => result.current.toggle());
  act(() => vi.advanceTimersByTime(5000));
  expect(result.current.enabled).toBe(false);
  expect(result.current.message).toContain("続けられませんでした");
});
it("can enable while paused without overriding user pause, and states a local non-Japanese fallback", () => {
  voices = [{ ...local, lang: "en-US" }];
  const { result, rerender } = renderHook(
    ({ paused }) => useImmersiveNarration("a", "記事", paused, true, 1),
    { initialProps: { paused: true } },
  );
  act(() => result.current.toggle());
  expect(synth.speak).not.toHaveBeenCalled();
  rerender({ paused: false });
  expect(synth.speak).toHaveBeenCalledOnce();
  expect(result.current.message).toContain("別言語");
});

it("segments long Japanese text without broken surrogate pairs and waits until the last segment", () => {
  const text = "🦊日本語".repeat(80);
  const { result } = renderHook(() => useImmersiveNarration("a", text, false, true, 1));
  act(() => result.current.toggle());
  const spoken: string[] = [];
  while (result.current.holding) {
    spoken.push(current.text);
    expect(Array.from(current.text).length).toBeLessThanOrEqual(100);
    act(() => {
      current.onstart?.();
      current.onend?.();
    });
  }
  expect(spoken.join("")).toBe(text);
});
it("does not let a startup/engine timeout expire during explicit pause or hidden time", () => {
  const { result, rerender } = setup();
  act(() => result.current.toggle());
  rerender({ key: "a", paused: true, visible: true });
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.enabled).toBe(true);
  rerender({ key: "a", paused: true, visible: false });
  rerender({ key: "a", paused: true, visible: true });
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.enabled).toBe(true);
  rerender({ key: "a", paused: false, visible: true });
  act(() => vi.advanceTimersByTime(5000));
  expect(result.current.enabled).toBe(false);
});
