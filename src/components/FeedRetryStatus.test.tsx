import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import FeedDetailModal from "./FeedDetailModal";
import FeedTitleContent from "./feed-item/FeedTitleContent";
import { apiFetch } from "@/lib/api-fetch";
import { makeFeed } from "../../e2e/helpers/feed";

vi.mock("./Modal", () => ({
  default: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));

const failure = "Response closed due to connection limit";
const retryExplanation = /最終エラーから24時間以上経過後/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ disabledFeeds: {} }));
});
afterEach(cleanup);

function Status({ errors, lastErrorAt }: { errors: number; lastErrorAt?: string }) {
  const feed = makeFeed({
    fetchError: errors ? failure : null,
    consecutiveErrors: errors,
    lastErrorAt: errors ? (lastErrorAt ?? "2026-09-30T03:00:55Z") : null,
  });
  return (
    <>
      <FeedDetailModal feed={feed} onClose={() => {}} />
      <FeedTitleContent feed={feed} isSelected isStale={false} isMuted={false} hasFilter={false} />
    </>
  );
}

describe("feed retry status copy", () => {
  it("keeps below-threshold errors as a warning", async () => {
    render(<Status errors={4} />);
    expect(screen.getByText("注意")).toBeInTheDocument();
    expect(screen.queryByText("自動再試行待ち")).not.toBeInTheDocument();
    expect(screen.queryByText(retryExplanation)).not.toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
  });

  it.each([5, 6])(
    "explains temporary automatic retry at %i errors without a fetch action",
    async (errors) => {
      render(<Status errors={errors} />);
      expect(screen.getByText("自動再試行待ち")).toBeInTheDocument();
      expect(screen.getByText(`自動再試行待ち · ${failure}`)).toBeInTheDocument();
      expect(screen.getByText(retryExplanation)).toHaveTextContent(
        "自動更新の対象に選ばれ、他の待機条件も満たすと再試行します",
      );
      expect(screen.getByText(retryExplanation)).toHaveTextContent(
        "フィードのメニューから「再試行」",
      );
      expect(screen.queryByText(/更新停止/)).not.toBeInTheDocument();
      await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
      expect(apiFetch).toHaveBeenCalledWith("/api/push/config");
    },
  );

  it("keeps the explanation conditional on selection before and after eligibility, then clears it on recovery", async () => {
    const { rerender } = render(<Status errors={5} lastErrorAt={new Date().toISOString()} />);
    expect(screen.getByText("自動再試行待ち")).toBeInTheDocument();
    rerender(<Status errors={5} lastErrorAt="2020-01-01T00:00:00Z" />);
    expect(screen.getByText("自動再試行待ち")).toBeInTheDocument();
    expect(screen.getByText(retryExplanation)).toHaveTextContent(
      "自動更新の対象に選ばれ、他の待機条件も満たすと再試行します",
    );
    rerender(<Status errors={0} />);
    expect(screen.getByText("正常")).toBeInTheDocument();
    expect(screen.queryByText(/自動再試行待ち/)).not.toBeInTheDocument();
    expect(screen.queryByText(retryExplanation)).not.toBeInTheDocument();
    expect(screen.queryByText(failure)).not.toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
  });
});
