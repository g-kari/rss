import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import CinematicArticle from "./CinematicArticle";

const state = vi.hoisted(() => ({
  visual: { motionEnabled: true, motionReason: "", pageVisible: true },
  playback: { playing: true, elapsed: 0, failed: false, finished: false, toggle: vi.fn() },
  usePlayback: vi.fn(),
}));
vi.mock("../contexts/VisualModeContext", () => ({ useVisualMode: () => state.visual }));
vi.mock("../hooks/useCinematicPlayback", () => ({
  CINEMATIC_DURATION: 20_000,
  useCinematicPlayback: state.usePlayback,
}));
const article = makeArticle({
  title: "本物の記事タイトル",
  summary: "<p>フィードにある説明を大きく表示します。</p>",
});
const props = {
  article,
  feedTitle: "Original feed",
  active: true,
  paused: false,
  speed: 1,
  onComplete: vi.fn(),
};
beforeEach(() => {
  Object.assign(state.visual, { motionEnabled: true, motionReason: "", pageVisible: true });
  Object.assign(state.playback, { playing: true, elapsed: 0, failed: false, finished: false });
  state.usePlayback.mockReset().mockImplementation(() => state.playback);
});
afterEach(cleanup);

describe("CinematicArticle", () => {
  it("autoplays only the active card and keeps a complete accessible transcript", () => {
    const { container, rerender } = render(<CinematicArticle {...props} />);
    expect(screen.getByRole("heading", { name: article.title })).toBeInTheDocument();
    expect(container.querySelector(".cinematic-caption")).toHaveTextContent(article.title);
    expect(container.querySelector(".cinematic-caption")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".cinematic-transcript")).toHaveTextContent(
      "フィードにある説明",
    );
    expect(state.usePlayback).toHaveBeenLastCalledWith(
      expect.any(Object),
      true,
      true,
      expect.objectContaining({
        autoPlay: true,
        paused: false,
        speed: 1,
        onComplete: props.onComplete,
      }),
    );
    rerender(<CinematicArticle {...props} active={false} />);
    expect(state.usePlayback).toHaveBeenLastCalledWith(
      expect.any(Object),
      false,
      true,
      expect.any(Object),
    );
    expect(container.querySelector("video, iframe, audio")).toBeNull();
  });
  it("uses the parent's persistent pause and speed settings across captions", () => {
    state.playback.elapsed = 12_000;
    const { container } = render(<CinematicArticle {...props} paused speed={0.75} />);
    expect(state.usePlayback).toHaveBeenLastCalledWith(
      expect.any(Object),
      true,
      true,
      expect.objectContaining({ paused: true, speed: 0.75 }),
    );
    expect(container.querySelector(".cinematic-caption")).toHaveTextContent(
      "フィードにある説明を大きく表示します。",
    );
    expect(container.querySelector(".cinematic-progress span")).toHaveStyle({ width: "60%" });
    expect(container.querySelector(".cinematic-shot")).toHaveAttribute("data-playing", "false");
  });
  it("preserves large captions in static/reduced motion and failed-animation fallbacks", () => {
    state.visual.motionReason = "端末の動きを減らす設定";
    const { container, rerender } = render(<CinematicArticle {...props} />);
    expect(state.usePlayback).toHaveBeenLastCalledWith(
      expect.any(Object),
      false,
      true,
      expect.any(Object),
    );
    expect(container.querySelector(".cinematic-caption")).not.toBeNull();
    expect(screen.getByText(/静止表示/)).toBeInTheDocument();
    state.visual.motionReason = "";
    state.playback.failed = true;
    rerender(<CinematicArticle {...props} />);
    expect(screen.getByText(/静止表示/)).toBeInTheDocument();
  });
  it("never mounts video on an inactive or reduced-motion card", () => {
    const video = { ...article, content: '<video src="https://example.com/movie.mp4"></video>' };
    const { container, rerender } = render(
      <CinematicArticle {...props} article={video} active={false} />,
    );
    expect(container.querySelector("video")).toBeNull();
    state.visual.motionReason = "データ節約設定";
    rerender(<CinematicArticle {...props} article={video} />);
    expect(container.querySelector("video")).toBeNull();
  });
  it("shows a truthful fallback when the feed has no excerpt or image", () => {
    render(<CinematicArticle {...props} article={{ ...article, summary: "", content: "" }} />);
    expect(screen.getByText(/短い説明はありません/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
