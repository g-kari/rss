/**
 * FeedHealthModal `now` 初期化テスト (#682 Phase B-2 → #623 の回帰防止)
 *
 * 目的: `const [now] = useState(() => new Date())` が mount 時 1 回固定であることを
 * 間接検証する。`vi.setSystemTime` で時刻を進めて再 render しても、`rateLimitedFeeds`
 * の判定基準が mount 時の now のまま固定されることを確認。
 *
 * 旧実装 (`useMemo(() => new Date(), [])`) では React 仕様上 memo が破棄される可能性が
 * あり、再 render で now が変動すると rateLimitedFeeds 判定が時刻と共に変わってしまう。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import FeedHealthModal from "./FeedHealthModal";
import type { Feed } from "@/types";

function makeFeed(overrides: Partial<Feed>): Feed {
  return {
    id: "feed-1",
    feedHash: "abc",
    url: "https://example.com/feed",
    title: "Test Feed",
    siteUrl: "https://example.com",
    subscribedAt: "2026-05-12T09:00:00Z",
    lastFetchedAt: "2026-05-12T09:30:00Z",
    articleCount: 0,
    ...overrides,
  } as Feed;
}

describe("FeedHealthModal — now 初期化 (#623 / #682 Phase B-2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // mount 時刻: 2026-05-12T10:00:00Z
    vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("rateLimitedUntil が mount 時刻より未来なら『レートリミット中』section が描画される", () => {
    const feeds: Feed[] = [
      makeFeed({
        id: "rate-limited",
        title: "Rate Limited Feed",
        rateLimitedUntil: "2026-05-12T10:10:00Z", // mount 時刻 + 10 分
      }),
    ];

    render(<FeedHealthModal feeds={feeds} onClose={() => {}} />);

    // section header が存在 (rateLimitedFeeds.length > 0)
    expect(screen.getByText("レートリミット中")).toBeInTheDocument();
    // 該当フィードタイトルが描画されている
    expect(screen.getByText("Rate Limited Feed")).toBeInTheDocument();
  });

  it("mount 後に時刻を進めて rerender しても、now は mount 時刻のまま固定される", () => {
    const feeds: Feed[] = [
      makeFeed({
        id: "rate-limited",
        title: "Rate Limited Feed",
        rateLimitedUntil: "2026-05-12T10:10:00Z", // mount 時刻 + 10 分
      }),
    ];

    const { rerender } = render(<FeedHealthModal feeds={feeds} onClose={() => {}} />);
    expect(screen.getByText("レートリミット中")).toBeInTheDocument();

    // 時刻を 20 分進める (rateLimitedUntil < new Date() になる時刻)
    vi.setSystemTime(new Date("2026-05-12T10:20:00Z"));
    // feeds props は新インスタンスで rerender → useMemo は再評価されるが、
    // useState の initializer は再実行されない (mount 時 1 回固定)
    rerender(<FeedHealthModal feeds={[...feeds]} onClose={() => {}} />);

    // now が mount 時刻 (10:00) のまま固定なら、依然 until=10:10 > now で section 残存
    expect(screen.getByText("レートリミット中")).toBeInTheDocument();
    expect(screen.getByText("Rate Limited Feed")).toBeInTheDocument();
  });

  it("複数の rateLimited feeds を全て描画する (mount 時 now で一括判定)", () => {
    const feeds: Feed[] = [
      makeFeed({
        id: "feed-1",
        title: "Feed One",
        rateLimitedUntil: "2026-05-12T10:05:00Z",
      }),
      makeFeed({
        id: "feed-2",
        title: "Feed Two",
        rateLimitedUntil: "2026-05-12T11:00:00Z",
      }),
      makeFeed({
        id: "feed-3-expired",
        title: "Feed Three Expired",
        rateLimitedUntil: "2026-05-12T09:55:00Z", // mount 時刻より過去 → 除外
      }),
    ];

    render(<FeedHealthModal feeds={feeds} onClose={() => {}} />);

    const section = screen.getByText("レートリミット中").closest("section");
    expect(section).not.toBeNull();
    const within_ = within(section as HTMLElement);
    expect(within_.getByText("Feed One")).toBeInTheDocument();
    expect(within_.getByText("Feed Two")).toBeInTheDocument();
    // 期限切れは描画されない (mount 時 now > until で除外)
    expect(within_.queryByText("Feed Three Expired")).toBeNull();
  });
});
