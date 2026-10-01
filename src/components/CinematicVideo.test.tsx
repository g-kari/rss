import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CinematicVideo, { CINEMATIC_VIDEO_STALL_TIMEOUT } from "./CinematicVideo";

vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));
const props = {
  src: "/api/video-proxy?url=https%3A%2F%2Fexample.com%2Fv.mp4",
  paused: false,
  pageVisible: true,
  speed: 1,
  onProgress: vi.fn(),
  onComplete: vi.fn(),
  onFallback: vi.fn(),
};
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CinematicVideo", () => {
  it("preserves sub-tick active waits across repeated pauses without falling back while paused", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<CinematicVideo {...props} />);
    for (let index = 0; index < 75; index++) {
      await act(async () => vi.advanceTimersByTime(200));
      rerender(<CinematicVideo {...props} paused />);
      await act(async () => vi.advanceTimersByTime(1000));
      expect(props.onFallback).not.toHaveBeenCalled();
      rerender(<CinematicVideo {...props} />);
    }
    await act(async () => vi.advanceTimersByTime(250));
    expect(props.onFallback).toHaveBeenCalledOnce();
  });
  it.each(["pause", "hidden"])(
    "freezes the stall budget while %s and continues on resume",
    async (reason) => {
      vi.useFakeTimers();
      play.mockImplementation(() => new Promise<void>(() => {}));
      const { rerender } = render(<CinematicVideo {...props} />);
      await act(async () => vi.advanceTimersByTime(10_000));
      rerender(
        <CinematicVideo {...props} paused={reason === "pause"} pageVisible={reason !== "hidden"} />,
      );
      await act(async () => vi.advanceTimersByTime(60_000));
      expect(props.onFallback).not.toHaveBeenCalled();
      expect(props.onComplete).not.toHaveBeenCalled();
      rerender(<CinematicVideo {...props} />);
      await act(async () => vi.advanceTimersByTime(CINEMATIC_VIDEO_STALL_TIMEOUT - 10_000 - 250));
      expect(props.onFallback).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTime(250));
      expect(props.onFallback).toHaveBeenCalledOnce();
    },
  );
  it("uses advancing media time even without timeupdate and ignores repeated buffering events", async () => {
    vi.useFakeTimers();
    render(<CinematicVideo {...props} />);
    const video = screen.getByLabelText("記事の動画（音声なし）") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { value: 0, writable: true });
    for (let index = 1; index <= 5; index++) {
      await act(async () => vi.advanceTimersByTime(10_000));
      video.currentTime = index * 10;
      fireEvent.stalled(video);
      fireEvent.waiting(video);
      await act(async () => vi.advanceTimersByTime(250));
    }
    expect(props.onFallback).not.toHaveBeenCalled();
    fireEvent.ended(video);
    fireEvent.error(video);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(props.onComplete).toHaveBeenCalledOnce();
    expect(props.onFallback).not.toHaveBeenCalled();
  });
  it("falls back exactly once despite late errors, ended and rejected play", async () => {
    vi.useFakeTimers();
    let reject: ((error: Error) => void) | undefined;
    play.mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    render(<CinematicVideo {...props} />);
    const video = screen.getByLabelText("記事の動画（音声なし）");
    await act(async () => vi.advanceTimersByTime(CINEMATIC_VIDEO_STALL_TIMEOUT));
    fireEvent.error(video);
    fireEvent.ended(video);
    await act(async () => reject?.(new Error("late failure")));
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(props.onFallback).toHaveBeenCalledOnce();
    expect(props.onComplete).not.toHaveBeenCalled();
  });
  it("cancels stale attempts and budgets on source changes and unmount", async () => {
    vi.useFakeTimers();
    const rejects: Array<(error: Error) => void> = [];
    play.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejects.push(reject);
        }),
    );
    const { rerender, unmount } = render(<CinematicVideo {...props} />);
    await act(async () => vi.advanceTimersByTime(10_000));
    rerender(<CinematicVideo {...props} src="/second.mp4" />);
    await act(async () => rejects[0](new Error("first navigation aborted")));
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(props.onFallback).not.toHaveBeenCalled();
    unmount();
    await act(async () => rejects[1](new Error("second navigation aborted")));
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(props.onFallback).not.toHaveBeenCalled();
    render(<CinematicVideo {...props} />);
    await act(async () => vi.advanceTimersByTime(CINEMATIC_VIDEO_STALL_TIMEOUT));
    expect(props.onFallback).toHaveBeenCalledOnce();
  });
  it("keeps watching across callback and speed changes and notifies the current owner", async () => {
    vi.useFakeTimers();
    const nextFallback = vi.fn();
    const { rerender } = render(<CinematicVideo {...props} />);
    await act(async () => vi.advanceTimersByTime(10_000));
    rerender(<CinematicVideo {...props} speed={2} onFallback={nextFallback} />);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(nextFallback).toHaveBeenCalledOnce();
    expect(props.onFallback).not.toHaveBeenCalled();
  });
  it("falls back when an active play request never settles", async () => {
    vi.useFakeTimers();
    play.mockImplementation(() => new Promise<void>(() => {}));
    render(<CinematicVideo {...props} />);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(props.onFallback).toHaveBeenCalledOnce();
    expect(props.onComplete).not.toHaveBeenCalled();
  });
  it("falls back when accepted playback stops making media-time progress", async () => {
    vi.useFakeTimers();
    render(<CinematicVideo {...props} />);
    const video = screen.getByLabelText("記事の動画（音声なし）");
    Object.defineProperty(video, "duration", { value: 60 });
    Object.defineProperty(video, "currentTime", { value: 15 });
    fireEvent.timeUpdate(video);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(props.onFallback).toHaveBeenCalledOnce();
    expect(props.onComplete).not.toHaveBeenCalled();
  });
  it("starts muted, pauses while hidden or user-paused, applies speed and stops on exit", async () => {
    const { rerender, unmount } = render(<CinematicVideo {...props} />);
    const video = screen.getByLabelText("記事の動画（音声なし）") as HTMLVideoElement;
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    rerender(<CinematicVideo {...props} paused speed={1.5} />);
    expect(pause).toHaveBeenCalled();
    expect(video.playbackRate).toBe(1.5);
    rerender(<CinematicVideo {...props} paused pageVisible={false} />);
    rerender(<CinematicVideo {...props} paused />);
    expect(play).toHaveBeenCalledOnce();
    rerender(<CinematicVideo {...props} />);
    expect(play).toHaveBeenCalledTimes(2);
    unmount();
    expect(pause).toHaveBeenCalled();
  });
  it("reports actual video progress and signals the endpoint only once", () => {
    render(<CinematicVideo {...props} />);
    const video = screen.getByLabelText("記事の動画（音声なし）");
    Object.defineProperty(video, "duration", { value: 60 });
    Object.defineProperty(video, "currentTime", { value: 15 });
    fireEvent.timeUpdate(video);
    expect(props.onProgress).toHaveBeenCalledWith(0.25);
    fireEvent.ended(video);
    fireEvent.ended(video);
    expect(props.onComplete).toHaveBeenCalledOnce();
  });
  it("falls back on blocked/unsupported video and ignores rejected play after exit", async () => {
    play.mockRejectedValueOnce(new Error("NotAllowedError"));
    const { unmount } = render(<CinematicVideo {...props} />);
    await waitFor(() => expect(props.onFallback).toHaveBeenCalledOnce());
    unmount();
    props.onFallback.mockClear();
    let reject: ((error: Error) => void) | undefined;
    play.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const next = render(<CinematicVideo {...props} />);
    next.unmount();
    await act(async () => reject?.(new Error("aborted")));
    expect(props.onFallback).not.toHaveBeenCalled();
  });
});
