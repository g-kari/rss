/**
 * The timeline is explicitly mocked at its lazy import boundary. The mock exposes only
 * the finite timeline operations we depend on; callbacks advance time deterministically.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devError } from "../lib/dev-log";
import { CINEMATIC_DURATION, useCinematicPlayback } from "./useCinematicPlayback";

interface TimelineOptions {
  autoplay: boolean;
  onUpdate: (self: { currentTime: number }) => void;
  onComplete: () => void;
}

class TimelineStub {
  speed = 1;
  add = vi.fn(() => this);
  play = vi.fn(() => this);
  pause = vi.fn(() => this);
  seek = vi.fn(() => this);
  revert = vi.fn(() => this);
}

const anime = vi.hoisted(() => ({
  loaded: vi.fn(),
  createTimeline: vi.fn<(options: TimelineOptions) => TimelineStub>(),
}));

vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));

let timeline: TimelineStub;
let options: TimelineOptions;
let imageRef: RefObject<HTMLDivElement | null>;

beforeEach(() => {
  anime.loaded.mockClear();
  vi.doMock("animejs/timeline", () => {
    anime.loaded();
    return { createTimeline: anime.createTimeline };
  });
  timeline = new TimelineStub();
  imageRef = { current: document.createElement("div") };
  anime.createTimeline.mockReset().mockImplementation((parameters) => {
    options = parameters;
    return timeline;
  });
  vi.mocked(devError).mockClear();
});

afterEach(async () => {
  cleanup();
  await vi.dynamicImportSettled();
  vi.doUnmock("animejs/timeline");
});

function renderPlayback(motionAllowed = true, pageVisible = true) {
  return renderHook(
    (props: { motionAllowed: boolean; pageVisible: boolean }) =>
      useCinematicPlayback(imageRef, props.motionAllowed, props.pageVisible),
    { initialProps: { motionAllowed, pageVisible } },
  );
}

async function startPlayback(toggle: () => void) {
  await act(async () => toggle());
  await waitFor(() => expect(anime.createTimeline).toHaveBeenCalledOnce());
}

describe("useCinematicPlayback", () => {
  it("does not import the animation module or autoplay on mount or policy changes", async () => {
    const { result, rerender } = renderPlayback(false);
    expect(result.current).toMatchObject({
      playing: false,
      elapsed: 0,
      finished: false,
      failed: false,
    });
    rerender({ motionAllowed: true, pageVisible: true });
    await act(async () => Promise.resolve());
    expect(anime.loaded).not.toHaveBeenCalled();
    expect(anime.createTimeline).not.toHaveBeenCalled();
    expect(timeline.play).not.toHaveBeenCalled();
  });

  it("starts a lazy, non-looping twenty-second timeline only after an explicit play action", async () => {
    const { result } = renderPlayback();
    await startPlayback(result.current.toggle);
    expect(anime.loaded).toHaveBeenCalledOnce();
    expect(anime.createTimeline).toHaveBeenCalledWith(expect.objectContaining({ autoplay: false }));
    expect(CINEMATIC_DURATION).toBe(20_000);
    expect(timeline.add).toHaveBeenCalledWith(imageRef.current, {
      scale: [1, 1.1],
      x: [0, -8],
      y: [0, -4],
      duration: 20_000,
      ease: "linear",
    });
    expect(anime.createTimeline.mock.calls[0][0]).not.toHaveProperty("loop");
    expect(timeline.play).toHaveBeenCalledOnce();
    expect(result.current.playing).toBe(true);
  });

  it("pauses and resumes the same timeline without resetting its elapsed position", async () => {
    const { result } = renderPlayback();
    await startPlayback(result.current.toggle);
    act(() => options.onUpdate({ currentTime: 5000 }));
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
    expect(result.current.elapsed).toBe(5000);
    expect(timeline.pause).toHaveBeenCalled();
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(true);
    expect(result.current.elapsed).toBe(5000);
    expect(timeline.play).toHaveBeenCalledTimes(2);
    expect(anime.createTimeline).toHaveBeenCalledOnce();
    expect(timeline.seek).not.toHaveBeenCalled();
    expect(timeline.revert).not.toHaveBeenCalled();
  });

  it("stops at twenty seconds and rewinds only when replay is requested", async () => {
    const { result } = renderPlayback();
    await startPlayback(result.current.toggle);
    act(() => options.onUpdate({ currentTime: 20_050 }));
    expect(result.current.elapsed).toBe(20_000);
    act(() => options.onComplete());
    expect(result.current).toMatchObject({ playing: false, elapsed: 20_000, finished: true });
    expect(timeline.play).toHaveBeenCalledOnce();
    expect(timeline.pause).toHaveBeenCalled();
    act(() => result.current.toggle());
    expect(timeline.seek).toHaveBeenCalledExactlyOnceWith(0, true);
    expect(result.current).toMatchObject({ playing: true, elapsed: 0, finished: false });
    expect(timeline.play).toHaveBeenCalledTimes(2);
    expect(anime.createTimeline).toHaveBeenCalledOnce();
  });

  it("limits progress state updates to quarter-second ticks", async () => {
    const { result } = renderPlayback();
    await startPlayback(result.current.toggle);
    act(() => options.onUpdate({ currentTime: 1000 }));
    expect(result.current.elapsed).toBe(1000);
    act(() => options.onUpdate({ currentTime: 1100 }));
    expect(result.current.elapsed).toBe(1000);
    act(() => options.onUpdate({ currentTime: 1250 }));
    expect(result.current.elapsed).toBe(1250);
  });

  it("pauses while hidden and resumes an already-playing session when visible", async () => {
    const { result, rerender } = renderPlayback();
    await startPlayback(result.current.toggle);
    act(() => options.onUpdate({ currentTime: 4000 }));
    rerender({ motionAllowed: true, pageVisible: false });
    expect(timeline.pause).toHaveBeenCalled();
    expect(timeline.play).toHaveBeenCalledOnce();
    expect(result.current.elapsed).toBe(4000);
    rerender({ motionAllowed: true, pageVisible: true });
    expect(timeline.play).toHaveBeenCalledTimes(2);
    expect(anime.createTimeline).toHaveBeenCalledOnce();
    expect(timeline.revert).not.toHaveBeenCalled();
  });

  it("does not resume a user-paused session when the page becomes visible", async () => {
    const { result, rerender } = renderPlayback();
    await startPlayback(result.current.toggle);
    act(() => result.current.toggle());
    rerender({ motionAllowed: true, pageVisible: false });
    rerender({ motionAllowed: true, pageVisible: true });
    expect(result.current.playing).toBe(false);
    expect(timeline.play).toHaveBeenCalledOnce();
  });

  it("cancels mode-off or reduced-motion sessions, restores image styles, and never auto-restarts", async () => {
    const { result, rerender } = renderPlayback();
    await startPlayback(result.current.toggle);
    act(() => options.onUpdate({ currentTime: 7500 }));
    rerender({ motionAllowed: false, pageVisible: true });
    expect(timeline.revert).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ playing: false, elapsed: 0, finished: false });
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
    rerender({ motionAllowed: true, pageVisible: true });
    expect(timeline.play).toHaveBeenCalledOnce();
    expect(anime.createTimeline).toHaveBeenCalledOnce();
    await act(async () => result.current.toggle());
    await waitFor(() => expect(anime.createTimeline).toHaveBeenCalledTimes(2));
    expect(result.current.playing).toBe(true);
  });

  it("does not create a timeline if unmounted before the lazy import settles", async () => {
    const { result, unmount } = renderPlayback();
    act(() => result.current.toggle());
    unmount();
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(anime.createTimeline).not.toHaveBeenCalled();
    expect(timeline.play).not.toHaveBeenCalled();
  });

  it("does not create a timeline if motion is disabled before the lazy import settles", async () => {
    const { result, rerender } = renderPlayback();
    act(() => result.current.toggle());
    rerender({ motionAllowed: false, pageVisible: true });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(anime.createTimeline).not.toHaveBeenCalled();
    expect(result.current.playing).toBe(false);
  });

  it("does not start playing if paused before the lazy import settles", async () => {
    const { result } = renderPlayback();
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(anime.createTimeline).toHaveBeenCalledOnce();
    expect(timeline.play).not.toHaveBeenCalled();
    expect(result.current.playing).toBe(false);
  });

  it("does not start playing if the page is hidden before the lazy import settles", async () => {
    const { result, rerender } = renderPlayback();
    act(() => result.current.toggle());
    rerender({ motionAllowed: true, pageVisible: false });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(anime.createTimeline).toHaveBeenCalledOnce();
    expect(timeline.play).not.toHaveBeenCalled();
    rerender({ motionAllowed: true, pageVisible: true });
    expect(timeline.play).toHaveBeenCalledOnce();
  });

  it("reverts the timeline when its component unmounts", async () => {
    const { result, unmount } = renderPlayback();
    await startPlayback(result.current.toggle);
    unmount();
    expect(timeline.revert).toHaveBeenCalledOnce();
  });

  it("falls back safely if timeline construction fails", async () => {
    const error = new Error("Animation unavailable");
    anime.createTimeline.mockImplementationOnce(() => {
      throw error;
    });
    const { result } = renderPlayback();
    await startPlayback(result.current.toggle);
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.playing).toBe(false);
    expect(devError).toHaveBeenCalledWith("[cinematic] Animation unavailable", error);
    act(() => result.current.toggle());
    expect(anime.createTimeline).toHaveBeenCalledOnce();
    expect(timeline.play).not.toHaveBeenCalled();
  });
});

it("autoplays an opted-in session, honors persistent pause/rate and completes only once", async () => {
  const complete = vi.fn();
  const { result, rerender } = renderHook(
    ({ paused, speed }) =>
      useCinematicPlayback(imageRef, true, true, {
        autoPlay: true,
        paused,
        speed,
        onComplete: complete,
      }),
    { initialProps: { paused: false, speed: 1 } },
  );
  await waitFor(() => expect(timeline.play).toHaveBeenCalledOnce());
  expect(result.current.playing).toBe(true);
  rerender({ paused: true, speed: 0.75 });
  expect(timeline.pause).toHaveBeenCalled();
  act(() => options.onComplete());
  expect(complete).not.toHaveBeenCalled();
  rerender({ paused: false, speed: 1.5 });
  expect(timeline.speed).toBe(1.5);
  act(() => options.onComplete());
  act(() => options.onComplete());
  expect(complete).toHaveBeenCalledOnce();
});

it("ignores late completion after unmount and while hidden", async () => {
  const complete = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ visible }) =>
      useCinematicPlayback(imageRef, true, visible, { autoPlay: true, onComplete: complete }),
    { initialProps: { visible: true } },
  );
  await waitFor(() => expect(timeline.play).toHaveBeenCalledOnce());
  rerender({ visible: false });
  act(() => options.onComplete());
  expect(complete).not.toHaveBeenCalled();
  unmount();
  act(() => options.onComplete());
  expect(complete).not.toHaveBeenCalled();
});
