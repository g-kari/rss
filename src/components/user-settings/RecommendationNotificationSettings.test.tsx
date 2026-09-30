import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecommendationNotificationSettings from "./RecommendationNotificationSettings";
import { apiFetch } from "../../lib/api-fetch";
import { STORAGE_KEYS } from "../../lib/storage";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => toast }));
const request = vi.mocked(apiFetch);
const config = { recommendationEnabled: false, recommendationTime: "09:00" };
const base = { userId: "one", config, timezone: "Asia/Tokyo", onTimezoneChange: vi.fn() };
beforeEach(() => {
  localStorage.clear();
  request.mockReset();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("RecommendationNotificationSettings", () => {
  it("is opt-in and disabled until configuration is loaded", () => {
    render(<RecommendationNotificationSettings {...base} config={null} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });
  it("offers only half-hour slots and explains privacy, quiet hours and subscription", () => {
    render(<RecommendationNotificationSettings {...base} />);
    const times = screen
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(times).toHaveLength(48);
    expect(times.every((time) => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(time))).toBe(true);
    expect(screen.getByText(/1日1回/)).toHaveTextContent("最大3件");
    expect(screen.getByText(/ID と日時/)).toHaveTextContent("閲覧履歴");
    expect(screen.getByText(/サイレント時間帯中/)).toBeInTheDocument();
    expect(screen.getByText(/Push 通知の有効化/)).toBeInTheDocument();
  });
  it("enables with this account's dismissal snapshot and fallback local timezone only", async () => {
    const records = [{ articleId: "one-only", dismissedAt: Date.now() }];
    localStorage.setItem(
      `${STORAGE_KEYS.ARTICLE_RECOMMENDATION_DISMISSALS}:one`,
      JSON.stringify(records),
    );
    localStorage.setItem(
      `${STORAGE_KEYS.ARTICLE_RECOMMENDATION_DISMISSALS}:two`,
      JSON.stringify([{ articleId: "two-private", dismissedAt: Date.now() }]),
    );
    request.mockResolvedValue(new Response("{}"));
    render(<RecommendationNotificationSettings {...base} timezone="" />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("switch")).not.toBeDisabled());
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual({
      recommendationEnabled: true,
      recommendationTime: "09:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      recommendationDismissals: records,
    });
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ "X-RSS-Account-Id": "one" });
    expect(base.onTimezoneChange).toHaveBeenCalled();
  });
  it("rolls back failed opt-in and failed time saves, including non-OK HTTP responses", async () => {
    request.mockResolvedValue(new Response("{}", { status: 503 }));
    render(<RecommendationNotificationSettings {...base} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "20:30" } });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("09:00"));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("saves the selected slot and configured timezone without transmitting feedback while disabled", async () => {
    request.mockResolvedValue(new Response("{}"));
    render(<RecommendationNotificationSettings {...base} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "20:30" } });
    await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual({
      recommendationEnabled: false,
      recommendationTime: "20:30",
      timezone: "Asia/Tokyo",
    });
  });
  it("does not deliver a late save or event to a newly selected account", async () => {
    let resolve!: (response: Response) => void;
    request.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const events = vi.fn();
    window.addEventListener("rss-recommendation-push-config", events);
    const view = render(<RecommendationNotificationSettings {...base} />);
    fireEvent.click(screen.getByRole("switch"));
    view.rerender(<RecommendationNotificationSettings {...base} userId="two" />);
    await act(async () => resolve(new Response("{}")));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(events).not.toHaveBeenCalled();
    window.removeEventListener("rss-recommendation-push-config", events);
  });
});
