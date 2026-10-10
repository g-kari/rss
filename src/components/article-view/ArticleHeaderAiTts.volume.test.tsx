import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../../e2e/helpers/article";
import { ToastProvider } from "../../contexts/ToastContext";
import { TtsAdapterProvider } from "../../contexts/TtsAdapterContext";
import { useArticleViewTts } from "../../hooks/useArticleViewTts";
import { useTtsControls } from "../../hooks/useTtsControls";
import { STORAGE_KEYS } from "../../lib/storage";
import { createDummyPiperAdapter } from "../../lib/tts-adapter";
import ArticleHeaderAiTts from "./ArticleHeaderAiTts";

const article = makeArticle({ id: "volume-article", title: "Volume article" });
const noop = () => {};
const toast = { toasts: [], success: noop, error: noop, info: noop, undo: noop, dismiss: noop };
const props: ComponentProps<typeof ArticleHeaderAiTts> = {
  article,
  section: "secondary",
  hasContent: true,
  hasImages: false,
  fetching: false,
  aiResult: null,
  aiLoading: false,
  aiError: null,
  resetAi: noop,
  doRunAi: noop,
  handleTranslate: noop,
  translateResult: null,
  translateLoading: false,
  translateError: null,
  ttsSupported: true,
  ttsPlaying: true,
  ttsPaused: false,
  ttsRate: 1,
  ttsCycleRate: noop,
  ttsVolume: 1,
  ttsCycleVolume: noop,
  onTtsToggle: noop,
  autoMode: false,
  onToggleAutoMode: noop,
  downloadAllImages: noop,
  downloadingImages: false,
  imageDownloadProgress: null,
};
const stop = vi.fn();
const speak = vi.fn();
const volumeChanges = vi.fn();
const rates = [1] as const;

function ConnectedHeader() {
  const tts = useArticleViewTts(article, "本文");
  return (
    <>
      <ArticleHeaderAiTts {...props} {...tts} onTtsToggle={tts.handleTtsToggle} />
      <output aria-label="読み上げ状態">
        {JSON.stringify({
          articleId: article.id,
          playing: tts.ttsPlaying,
          paused: tts.ttsPaused,
          ended: tts.ttsEndedCount,
          rate: tts.ttsRate,
          volume: tts.ttsVolume,
        })}
      </output>
    </>
  );
}

function Fixture({ paused = false }: { paused?: boolean }) {
  const controls = useTtsControls({ rates, defaultRate: 1 });
  return (
    <ToastProvider value={toast}>
      <TtsAdapterProvider
        value={{
          ...createDummyPiperAdapter(),
          ...controls,
          supported: true,
          isPlaying: !paused,
          isPaused: paused,
          endedCount: 3,
          setVolume: (value) => {
            volumeChanges(value);
            controls.setVolume(value);
          },
          stop,
          speak,
        }}
      >
        <ConnectedHeader />
      </TtsAdapterProvider>
    </ToastProvider>
  );
}

function volumeButton() {
  return screen.getByRole("button", { name: /^音量 / });
}

function expectVolume(current: number, next: number) {
  const button = volumeButton();
  expect(button).toHaveAccessibleName(`音量 ${current}パーセント、次は ${next}パーセント`);
  expect(button).toHaveAttribute("title", `音量: ${current}% → 次: ${next}%（10%ずつ調整）`);
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  const muteMark = button.querySelector('path[d="M9 5l4 4M13 5l-4 4"]');
  expect(muteMark !== null).toBe(current === 0);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("article-header volume control", () => {
  it("cycles 100→90→…→0→100 once per click through the real article TTS hook", () => {
    localStorage.setItem("unrelated-reader-setting", "unchanged");
    localStorage.setItem(STORAGE_KEYS.TTS_VOICE_URI, "piper:tsukuyomi");
    const write = vi.spyOn(localStorage, "setItem");
    render(<Fixture />);
    expect(stop).toHaveBeenCalledOnce(); // Only the production article-change effect.
    expectVolume(100, 90);
    const expected = [90, 80, 70, 60, 50, 40, 30, 20, 10, 0, 100];
    for (const [index, percent] of expected.entries()) {
      fireEvent.click(volumeButton());
      expectVolume(percent, percent === 0 ? 100 : percent - 10);
      expect(volumeChanges).toHaveBeenCalledTimes(index + 1);
      expect(volumeChanges).toHaveBeenLastCalledWith(percent / 100);
    }
    expect(write.mock.calls).toEqual(
      expected.map((percent) => [STORAGE_KEYS.TTS_VOLUME, String(percent / 100)]),
    );
    expect(localStorage.getItem("unrelated-reader-setting")).toBe("unchanged");
    expect(localStorage.getItem(STORAGE_KEYS.TTS_VOICE_URI)).toBe("piper:tsukuyomi");
    expect(stop).toHaveBeenCalledOnce();
    expect(speak).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "読み上げ状態" })).toHaveTextContent(
      JSON.stringify({
        articleId: article.id,
        playing: true,
        paused: false,
        ended: 3,
        rate: 1,
        volume: 1,
      }),
    );
  });

  it.each([
    [0.83, 83, 73],
    [0.05, 5, 0],
    [0.01, 1, 0],
  ])(
    "preserves the saved percentage %s and clamps a low positive next value",
    (value, current, next) => {
      localStorage.setItem(STORAGE_KEYS.TTS_VOLUME, String(value));
      render(<Fixture />);
      expectVolume(current, next);
      fireEvent.click(volumeButton());
      expectVolume(next, next === 0 ? 100 : next - 10);
      expect(volumeChanges).toHaveBeenCalledExactlyOnceWith(next / 100);
      expect(localStorage.getItem(STORAGE_KEYS.TTS_VOLUME)).toBe(String(next / 100));
      expect(stop).toHaveBeenCalledOnce();
      expect(speak).not.toHaveBeenCalled();
    },
  );

  it("shows the mute mark only at exact zero, including volumes below the former half-volume cutoff", () => {
    const { rerender } = render(<ArticleHeaderAiTts {...props} />);
    for (const volume of [1, 0.9, 0.5, 0.49, 0.1, 0.01, 0.001]) {
      rerender(<ArticleHeaderAiTts {...props} ttsVolume={volume} />);
      expect(volumeButton().querySelector('path[d="M9 5l4 4M13 5l-4 4"]')).toBeNull();
      expect(volumeButton().querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
    rerender(<ArticleHeaderAiTts {...props} ttsVolume={0} />);
    expectVolume(0, 100);
  });

  it("keeps paused playback paused and restores the selected percentage after remount", () => {
    localStorage.setItem(STORAGE_KEYS.TTS_VOLUME, "0.83");
    const { unmount } = render(<Fixture paused />);
    fireEvent.click(volumeButton());
    expectVolume(73, 63);
    expect(screen.getByRole("status", { name: "読み上げ状態" })).toHaveTextContent('"paused":true');
    unmount();
    render(<Fixture paused />);
    expectVolume(73, 63);
    expect(volumeChanges).toHaveBeenCalledExactlyOnceWith(0.73);
    expect(speak).not.toHaveBeenCalled();
  });

  it("exposes volume only for a playing or paused secondary/all section", () => {
    const { rerender } = render(<ArticleHeaderAiTts {...props} ttsPlaying={false} />);
    expect(screen.queryByRole("button", { name: /^音量 / })).not.toBeInTheDocument();
    rerender(<ArticleHeaderAiTts {...props} ttsPlaying={false} ttsPaused />);
    expectVolume(100, 90);
    rerender(<ArticleHeaderAiTts {...props} section="primary" />);
    expect(screen.queryByRole("button", { name: /^音量 / })).not.toBeInTheDocument();
    rerender(<ArticleHeaderAiTts {...props} section="all" />);
    expectVolume(100, 90);
  });
});
