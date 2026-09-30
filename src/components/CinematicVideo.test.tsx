import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CinematicVideo from "./CinematicVideo";

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
  vi.restoreAllMocks();
});

describe("CinematicVideo", () => {
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
