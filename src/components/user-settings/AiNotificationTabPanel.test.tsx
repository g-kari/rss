import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import AiNotificationTabPanel from "./AiNotificationTabPanel";
import { apiFetch } from "../../lib/api-fetch";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("../../lib/browser-translator", () => ({
  diagnoseTranslatorAvailability: async () => ({ available: false, reason: null }),
}));
vi.mock("../../lib/browser-summarizer", () => ({
  diagnoseSummarizerAvailability: async () => ({ available: false, reason: null }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => toast }));
const request = vi.mocked(apiFetch);
const props = {
  userId: "one",
  hidden: false,
  autoTranslate: false,
  toggleAutoTranslate: vi.fn(),
  autoSummarize: false,
  toggleAutoSummarize: vi.fn(),
  autoAiBrowserOnly: false,
  toggleAutoAiBrowserOnly: vi.fn(),
  aiProvider: "auto" as const,
  onChangeAiProvider: vi.fn(),
  aiModel: "@cf/meta/llama-3.1-8b-instruct" as const,
  onChangeAiModel: vi.fn(),
};
beforeEach(() => {
  request.mockReset();
  vi.useFakeTimers();
  vi.stubGlobal("PushManager", function PushManager() {});
  Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("recommendation settings integration", () => {
  it("hydrates enabled time and timezone without automatically saving config", async () => {
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          recommendationEnabled: true,
          recommendationTime: "18:30",
          timezone: "UTC",
          silentStart: "22:00",
          silentEnd: "07:00",
          errorNotificationsEnabled: true,
        }),
      ),
    );
    render(<AiNotificationTabPanel {...props} />);
    await act(async () => {});
    expect(screen.getByRole("switch", { name: "おすすめ記事通知を OFF にする" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("combobox", { name: /おすすめ記事通知 配信時刻/ })).toHaveValue(
      "18:30",
    );
    expect(screen.getByRole("combobox", { name: "Push 通知 タイムゾーン" })).toHaveValue("UTC");
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ "X-RSS-Account-Id": "one" });
  });
  it("keeps recommendation controls disabled when configuration cannot load", async () => {
    request.mockResolvedValue(new Response("{}", { status: 503 }));
    render(<AiNotificationTabPanel {...props} />);
    await act(async () => {});
    expect(screen.getByRole("switch", { name: "おすすめ記事通知を ON にする" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /おすすめ記事通知 配信時刻/ })).toBeDisabled();
  });
});
