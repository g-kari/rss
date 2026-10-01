import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";
import ImmersiveArticleMode from "./ImmersiveArticleMode";
import { CINEMATIC_VIDEO_STALL_TIMEOUT } from "./CinematicVideo";

const state = vi.hoisted(() => ({
  visual: { motionEnabled: true, motionReason: "", pageVisible: true },
  holding: false,
}));
vi.mock("../contexts/VisualModeContext", () => ({ useVisualMode: () => state.visual }));
vi.mock("../hooks/useImmersiveNarration", () => ({
  useImmersiveNarration: () => ({
    enabled: state.holding,
    holding: state.holding,
    toggle: vi.fn(),
    message: "",
  }),
}));
vi.mock("../hooks/useCinematicPlayback", () => ({
  CINEMATIC_DURATION: 20_000,
  useCinematicPlayback: () => ({ failed: false }),
}));
vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));
const now = Date.parse("2026-10-01T12:00:00Z");
const articles = [0, 1].map((index) =>
  makeArticle({
    id: `video-article-${index}`,
    title: `動画記事 ${index}`,
    link: `https://example.com/video-${index}`,
    summary: "短い説明です。",
    content: index === 0 ? '<video src="https://example.com/movie.mp4"></video>' : "",
    publishedAt: new Date(now - index * 1000).toISOString(),
  }),
);
const props = {
  candidates: articles,
  articles,
  feeds: [makeFeed({ id: articles[0].feedHash })],
  now,
  readIds: new Set<string>(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  likeIds: new Set<string>(),
  historyIds: new Set<string>(),
  dismissedIds: new Set<string>(),
  onClose: vi.fn(),
  onSelectArticle: vi.fn(),
  onDismiss: vi.fn(),
  onRestore: vi.fn(),
};
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(state.visual, { motionEnabled: true, motionReason: "", pageVisible: true });
  state.holding = false;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
    () => new Promise<void>(() => {}),
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function advance(time: number) {
  await act(async () => vi.advanceTimersByTime(time));
}
function counter() {
  return screen.getByText(/^[12] \/ 2件$/);
}

it("restores the real article clock after a pending native video and waits for narration", async () => {
  state.holding = true;
  const { rerender } = render(<ImmersiveArticleMode {...props} />);
  expect(screen.getByLabelText("記事の動画（音声なし）")).toBeInTheDocument();
  await advance(CINEMATIC_VIDEO_STALL_TIMEOUT);
  expect(screen.queryByLabelText("記事の動画（音声なし）")).toBeNull();
  expect(counter()).toHaveTextContent("1 / 2件");
  await advance(20_000);
  expect(counter()).toHaveTextContent("1 / 2件");
  state.holding = false;
  rerender(<ImmersiveArticleMode {...props} />);
  expect(counter()).toHaveTextContent("2 / 2件");
});
it("retains the first article during a pause or hidden tab before and after fallback", async () => {
  const { rerender } = render(<ImmersiveArticleMode {...props} />);
  await advance(5_000);
  fireEvent.click(screen.getByRole("button", { name: "自動再生を一時停止" }));
  await advance(60_000);
  expect(screen.getByLabelText("記事の動画（音声なし）")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "自動再生を再開" }));
  state.visual.pageVisible = false;
  rerender(<ImmersiveArticleMode {...props} />);
  await advance(60_000);
  expect(screen.getByLabelText("記事の動画（音声なし）")).toBeInTheDocument();
  state.visual.pageVisible = true;
  rerender(<ImmersiveArticleMode {...props} />);
  await advance(10_000);
  expect(screen.queryByLabelText("記事の動画（音声なし）")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "自動再生を一時停止" }));
  await advance(60_000);
  expect(counter()).toHaveTextContent("1 / 2件");
  fireEvent.click(screen.getByRole("button", { name: "自動再生を再開" }));
  await advance(20_000);
  expect(counter()).toHaveTextContent("2 / 2件");
});
it("normal video end advances once and repeated navigation owns a fresh video budget", async () => {
  render(<ImmersiveArticleMode {...props} />);
  const firstVideo = screen.getByLabelText("記事の動画（音声なし）");
  fireEvent.ended(firstVideo);
  fireEvent.ended(firstVideo);
  expect(counter()).toHaveTextContent("2 / 2件");
  for (let index = 0; index < 3; index++) {
    fireEvent.click(screen.getByRole("button", { name: "前の記事" }));
    await advance(10_000);
    expect(screen.getByLabelText("記事の動画（音声なし）")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
    expect(counter()).toHaveTextContent("2 / 2件");
  }
  fireEvent.click(screen.getByRole("button", { name: "前の記事" }));
  await advance(CINEMATIC_VIDEO_STALL_TIMEOUT);
  expect(counter()).toHaveTextContent("1 / 2件");
  await advance(20_000);
  expect(counter()).toHaveTextContent("2 / 2件");
});
