import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "../types";
import CinematicArticle from "./CinematicArticle";

const state = vi.hoisted(() => ({
  visual: { motionAllowed: true, pageVisible: true },
  playback: { playing: false, elapsed: 0, failed: false, finished: false, toggle: vi.fn() },
  usePlayback: vi.fn(),
}));

vi.mock("../contexts/VisualModeContext", () => ({ useVisualMode: () => state.visual }));
vi.mock("../hooks/useCinematicPlayback", () => ({
  CINEMATIC_DURATION: 20_000,
  useCinematicPlayback: state.usePlayback,
}));

const article: Article = {
  id: "one",
  feedHash: "feed",
  guid: "one",
  title: "A real feed headline",
  link: "https://example.com/article",
  summary: "<p>Original feed text &amp; context.</p>",
  publishedAt: "2026-09-30T10:00:00Z",
  createdAt: "2026-09-30T10:00:00Z",
};
const props = { article, feedTitle: "Original feed", active: true };

beforeEach(() => {
  state.visual.motionAllowed = true;
  state.visual.pageVisible = true;
  Object.assign(state.playback, { playing: false, elapsed: 0, failed: false, finished: false });
  state.playback.toggle.mockClear();
  state.usePlayback.mockReset().mockImplementation(() => state.playback);
});
afterEach(cleanup);

describe("CinematicArticle", () => {
  it("keeps the headline and feed excerpt accessible while decorative captions are hidden", () => {
    const { container } = render(<CinematicArticle {...props} />);
    expect(screen.getByRole("heading", { name: article.title })).toBeInTheDocument();
    expect(screen.getByText("Original feed")).toBeInTheDocument();
    const transcript = container.querySelector(".cinematic-transcript");
    expect(transcript).toHaveTextContent("フィードの説明Original feed text & context.");
    expect(transcript).not.toHaveAttribute("aria-hidden");
    expect(container.querySelector(".cinematic-caption")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".cinematic-image")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("audio, video, iframe")).toBeNull();
    expect(container.querySelector(".cinematic-shot")).toHaveAttribute("data-playing", "false");
    expect(state.playback.toggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "20秒の演出を再生" }));
    expect(state.playback.toggle).toHaveBeenCalledOnce();
  });

  it("disables playback for inactive cards and removes their controls", () => {
    const { rerender } = render(<CinematicArticle {...props} />);
    expect(state.usePlayback).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: expect.any(HTMLDivElement) }),
      true,
      true,
    );
    rerender(<CinematicArticle {...props} active={false} />);
    expect(state.usePlayback).toHaveBeenLastCalledWith(expect.any(Object), false, true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("heading", { name: article.title })).toBeInTheDocument();
  });

  it("offers a static view when motion is disallowed or animation loading fails", () => {
    state.visual.motionAllowed = false;
    const { container, rerender } = render(<CinematicArticle {...props} />);
    expect(state.usePlayback).toHaveBeenLastCalledWith(expect.any(Object), false, true);
    expect(screen.getByText("静止表示で楽しめます")).toBeInTheDocument();
    expect(container.querySelector(".cinematic-caption")).toBeNull();
    expect(container.querySelector(".cinematic-transcript")).toHaveTextContent(
      "Original feed text & context.",
    );
    expect(screen.queryByRole("button")).toBeNull();
    state.visual.motionAllowed = true;
    state.playback.failed = true;
    rerender(<CinematicArticle {...props} />);
    expect(screen.getByText("静止表示で楽しめます")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reflects pause and replay states with an explicit finite endpoint", () => {
    state.playback.playing = true;
    state.playback.elapsed = 10_000;
    const { container, rerender } = render(<CinematicArticle {...props} />);
    expect(screen.getByRole("button", { name: "演出を一時停止" })).toBeInTheDocument();
    expect(container.querySelector(".cinematic-progress span")).toHaveStyle({ width: "50%" });
    expect(container.querySelector(".cinematic-shot")).toHaveAttribute("data-playing", "true");
    state.visual.pageVisible = false;
    rerender(<CinematicArticle {...props} />);
    expect(state.usePlayback).toHaveBeenLastCalledWith(expect.any(Object), true, false);
    expect(container.querySelector(".cinematic-shot")).toHaveAttribute("data-playing", "false");
    state.playback.playing = false;
    state.playback.finished = true;
    state.playback.elapsed = 20_000;
    rerender(<CinematicArticle {...props} />);
    expect(screen.getByRole("button", { name: "20秒の演出をもう一度再生" })).toBeInTheDocument();
    expect(screen.getByText("ここでストップ")).toBeInTheDocument();
    expect(container.querySelector(".cinematic-progress span")).toHaveStyle({ width: "100%" });
    expect(state.playback.toggle).not.toHaveBeenCalled();
  });

  it("shows a truthful fallback when the feed has no excerpt or image", () => {
    render(<CinematicArticle {...props} article={{ ...article, summary: "", content: "" }} />);
    expect(
      screen.getByText("短い説明はありません。「本文を読む」から記事を開けます。", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
