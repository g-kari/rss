import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { acquireImmersiveSession } from "../../lib/immersive-session";
import { makeArticle } from "../../../e2e/helpers/article";
import AutoReadController from "./AutoReadController";
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ info: vi.fn() }) }));
const props = {
  enabled: true,
  article: makeArticle(),
  ttsSupported: true,
  ttsPlaying: false,
  ttsPaused: false,
  ttsEndedCount: 0,
  fetching: false,
  fetchError: "",
  hasFullContent: true,
  canFetch: false,
  ttsText: "本文",
  autoTranslatePending: false,
  autoSummarizePending: false,
  onSpeak: vi.fn(),
  onTtsStop: vi.fn(),
  onFetch: vi.fn(),
  hasNext: true,
  onSelectNext: vi.fn(),
  onAutoMarkRead: vi.fn(),
  onAutoModeStop: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("prevents underlying auto-speech and read/advance callbacks while immersive owns playback", () => {
  const release = acquireImmersiveSession();
  const { rerender } = render(<AutoReadController {...props} />);
  expect(props.onSpeak).not.toHaveBeenCalled();
  rerender(<AutoReadController {...props} ttsEndedCount={1} />);
  act(() => vi.advanceTimersByTime(10000));
  expect(props.onSelectNext).not.toHaveBeenCalled();
  expect(props.onAutoMarkRead).not.toHaveBeenCalled();
  act(() => release());
  expect(props.onSpeak).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(10000));
  expect(props.onSelectNext).not.toHaveBeenCalled();
});
it("cancels a pending underlying auto-advance when immersive is entered", () => {
  const { rerender } = render(<AutoReadController {...props} />);
  rerender(<AutoReadController {...props} ttsEndedCount={1} />);
  let release: () => void = () => {};
  act(() => {
    release = acquireImmersiveSession();
  });
  act(() => vi.advanceTimersByTime(10000));
  expect(props.onSelectNext).not.toHaveBeenCalled();
  expect(props.onAutoMarkRead).not.toHaveBeenCalled();
  act(() => release());
});
