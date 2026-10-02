import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import CinematicArticle from "./CinematicArticle";
import { contentLruCache } from "../lib/lru-cache";
import { getProviderContentCacheId } from "../lib/slide-providers";

const state = vi.hoisted(() => ({
  visual: { motionEnabled: true, motionReason: "", pageVisible: true },
  playback: { playing: true, elapsed: 0, failed: false, finished: false, toggle: vi.fn() },
  usePlayback: vi.fn(),
  elapsed: 0,
  clock: vi.fn(),
}));
vi.mock("../contexts/VisualModeContext", () => ({ useVisualMode: () => state.visual }));
vi.mock("../hooks/useImmersiveClock", () => ({ useImmersiveClock: state.clock }));
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
  state.elapsed = 0;
  state.clock.mockReset().mockImplementation(() => state.elapsed);
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
    state.elapsed = 12_000;
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
    expect(state.clock).toHaveBeenLastCalledWith(true, false, true, 1, 20000, props.onComplete);
    expect(container.querySelector(".cinematic-caption")).not.toBeNull();
    expect(screen.getByText(/画像の動き/)).toBeInTheDocument();
    state.visual.motionReason = "";
    state.playback.failed = true;
    rerender(<CinematicArticle {...props} />);
    expect(screen.getByText(/画像の動き/)).toBeInTheDocument();
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
  it("labels shortened cached summaries separately from loaded excerpt previews", () => {
    const presentation = {
      text: "取得済みの説明です。",
      source: "excerpt" as const,
      sourceLabel: "フィード説明の抜粋",
      metadata: null,
      previewShortened: true,
    };
    const { rerender } = render(<CinematicArticle {...props} textPresentation={presentation} />);
    expect(
      screen.getByText("表示は説明・本文の抜粋です。本文から続きを確認できます。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/続きは要約表示/)).toBeNull();
    rerender(
      <CinematicArticle
        {...props}
        textPresentation={{ ...presentation, source: "cached-ai", sourceLabel: "保存済みのAI要約" }}
      />,
    );
    expect(
      screen.getByText("表示は要約の抜粋です。続きは要約表示で確認できます。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/本文から続きを/)).toBeNull();
  });
  it("keeps overflow display information keyboard-reachable without article navigation", () => {
    state.visual.motionReason = "静止表示";
    const parentKey = vi.fn();
    const pause = vi.fn();
    render(
      <div onKeyDown={parentKey}>
        <CinematicArticle {...props} onPause={pause} />
      </div>,
    );
    const information = screen.getByRole("region", { name: "記事の表示情報をスクロール" });
    information.focus();
    expect(information).toHaveFocus();
    expect(pause).toHaveBeenCalledOnce();
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown"])
      fireEvent.keyDown(information, { key });
    expect(parentKey).not.toHaveBeenCalled();
    expect(information).toHaveTextContent("画像の動きは停止中");
  });
  it("refreshes captions from a newly loaded cache when returning from inline reading", () => {
    const current = {
      ...article,
      id: "cinematic-cache-refresh",
      link: "https://example.com/cache-refresh",
      summary: "説明の文です。".repeat(20),
    };
    const { container, rerender } = render(
      <CinematicArticle {...props} article={current} paused />,
    );
    for (let index = 0; index < 5; index++)
      fireEvent.click(screen.getByRole("button", { name: "次の説明" }));
    contentLruCache.set(
      getProviderContentCacheId(current.id, current.link),
      "取得した本文を続けて読みます。",
    );
    rerender(<CinematicArticle {...props} article={current} paused />);
    expect(container.querySelector(".cinematic-caption")).toHaveTextContent(
      "取得した本文を続けて読みます。",
    );
  });
});
