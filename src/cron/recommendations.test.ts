// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, PushConfig, ReadState } from "../types";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  subscriptions: vi.fn(),
  latest: vi.fn(),
  groups: vi.fn(),
  reads: vi.fn(),
}));
vi.mock("../lib/web-push", () => ({ sendPush: mocks.send }));
vi.mock("../lib/shared-feed", () => ({
  readUserSubscriptions: mocks.subscriptions,
  readLatestArticles: mocks.latest,
  buildFeedUserMapCached: vi.fn(),
}));
vi.mock("../lib/feed-groups", () => ({ readFeedGroups: mocks.groups }));
vi.mock("../lib/read-state-merge", () => ({ readNormalizedReadState: mocks.reads }));
import { sendUserRecommendations } from "./recommendations";

const NOW = Date.parse("2026-09-30T00:30:00Z");
const article: Article = {
  id: "article",
  feedHash: "feed",
  title: "Useful article",
  summary: "",
  link: "https://example.com/1",
  guid: "1",
  publishedAt: new Date(NOW).toISOString(),
  createdAt: new Date(NOW).toISOString(),
};
const readState: ReadState = { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] };
function memoryBucket(config: Partial<PushConfig> = {}) {
  const objects = new Map<string, { etag: string; value: string }>();
  let version = 0;
  objects.set("users/user/push.json", {
    etag: "init",
    value: JSON.stringify({
      subscriptions: [
        { endpoint: "https://push.example/one", keys: { p256dh: "key", auth: "auth" } },
      ],
      recommendationEnabled: true,
      recommendationTime: "09:00",
      timezone: "Asia/Tokyo",
      ...config,
    }),
  });
  const bucket = {
    get: vi.fn(async (key: string) => {
      const object = objects.get(key);
      return object ? { etag: object.etag, json: async () => JSON.parse(object.value) } : null;
    }),
    put: vi.fn(async (key: string, value: string, options?: R2PutOptions) => {
      const current = objects.get(key);
      const condition = options?.onlyIf as R2Conditional | undefined;
      if (condition?.etagMatches && condition.etagMatches !== current?.etag) return null;
      if (condition?.etagDoesNotMatch === "*" && current) return null;
      const etag = `${++version}`;
      objects.set(key, { etag, value });
      return { etag };
    }),
  } as unknown as R2Bucket;
  return { bucket, objects };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.send.mockResolvedValue({ ok: true, gone: false });
  mocks.subscriptions.mockResolvedValue([
    { feedHash: "feed", url: "https://example.com/rss", customTitle: "Example" },
  ]);
  mocks.latest.mockResolvedValue([article]);
  mocks.groups.mockResolvedValue([]);
  mocks.reads.mockResolvedValue(readState);
});
describe("daily recommendation delivery", () => {
  it("sends one digest and never repeats across concurrent calls, retries or the next day", async () => {
    const { bucket } = memoryBucket();
    await Promise.all([
      sendUserRecommendations(bucket, "user", NOW),
      sendUserRecommendations(bucket, "user", NOW),
    ]);
    await sendUserRecommendations(bucket, "user", NOW + 1800000);
    await sendUserRecommendations(bucket, "user", NOW + 86400000);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toMatchObject({
      title: "今日のおすすめ",
      url: "/?recommendations=1",
      renotify: false,
    });
  });
  it("retries only definite provider rejections, never a successful device or ambiguous outcome", async () => {
    const { bucket } = memoryBucket({
      subscriptions: ["one", "two", "three"].map((id) => ({
        endpoint: `https://push.example/${id}`,
        expirationTime: null,
        keys: { p256dh: "key", auth: "auth" },
      })),
    });
    mocks.send
      .mockResolvedValueOnce({ ok: true, gone: false })
      .mockResolvedValueOnce({ ok: false, gone: false, retryable: true })
      .mockResolvedValueOnce({ ok: false, gone: false });
    await sendUserRecommendations(bucket, "user", NOW);
    await sendUserRecommendations(bucket, "user", NOW + 1800000);
    expect(mocks.send).toHaveBeenCalledTimes(4);
    expect(mocks.send.mock.calls[3][0].endpoint).toBe("https://push.example/two");
  });
  it("rechecks read state and consent before retries", async () => {
    const { bucket } = memoryBucket();
    mocks.send.mockResolvedValue({ ok: false, gone: false, retryable: true });
    await sendUserRecommendations(bucket, "user", NOW);
    mocks.reads.mockResolvedValue({ ...readState, readIds: ["article"] });
    await sendUserRecommendations(bucket, "user", NOW + 1800000);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("honors provider Retry-After and retries the planned articles even when newer ones arrive", async () => {
    const { bucket } = memoryBucket();
    mocks.send.mockResolvedValueOnce({
      ok: false,
      gone: false,
      retryable: true,
      retryAfterMs: 3600000,
    });
    await sendUserRecommendations(bucket, "user", NOW);
    await sendUserRecommendations(bucket, "user", NOW + 1800000);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    mocks.latest.mockResolvedValue(
      [1, 2, 3, 4]
        .map<Article>((id) => ({
          ...article,
          id: `new-${id}`,
          publishedAt: new Date(NOW + 3600000).toISOString(),
        }))
        .concat(article),
    );
    await sendUserRecommendations(bucket, "user", NOW + 3600000);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][1].body).toBe("Useful article");
  });
  it("does not deliver to later devices after consent is withdrawn mid-batch", async () => {
    const { bucket, objects } = memoryBucket({
      subscriptions: ["one", "two"].map((id) => ({
        endpoint: `https://push.example/${id}`,
        expirationTime: null,
        keys: { p256dh: "key", auth: "auth" },
      })),
    });
    mocks.send.mockImplementationOnce(async () => {
      const object = objects.get("users/user/push.json")!;
      objects.set("users/user/push.json", {
        etag: "optout",
        value: JSON.stringify({ ...JSON.parse(object.value), recommendationEnabled: false }),
      });
      return { ok: true, gone: false };
    });
    await sendUserRecommendations(bucket, "user", NOW);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not deliver newly read articles to later devices in a slow batch", async () => {
    const { bucket } = memoryBucket({
      subscriptions: ["one", "two"].map((id) => ({
        endpoint: `https://push.example/${id}`,
        expirationTime: null,
        keys: { p256dh: "key", auth: "auth" },
      })),
    });
    mocks.send.mockImplementationOnce(async () => {
      mocks.reads.mockResolvedValue({ ...readState, readIds: ["article"] });
      return { ok: true, gone: false };
    });
    await sendUserRecommendations(bucket, "user", NOW);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("prunes expired endpoints without erasing concurrently edited preferences", async () => {
    const { bucket, objects } = memoryBucket();
    mocks.send.mockImplementationOnce(async () => {
      const object = objects.get("users/user/push.json")!;
      objects.set("users/user/push.json", {
        etag: "preference-edit",
        value: JSON.stringify({ ...JSON.parse(object.value), recommendationTime: "10:00" }),
      });
      return { ok: false, gone: true };
    });
    await sendUserRecommendations(bucket, "user", NOW);
    const config = JSON.parse(objects.get("users/user/push.json")!.value);
    expect(config.recommendationTime).toBe("10:00");
    expect(config.subscriptions).toEqual([]);
  });
  it("does no article work or notification if opted out, unsubscribed or in quiet hours", async () => {
    for (const config of [
      { recommendationEnabled: false },
      { subscriptions: [] },
      { silentStart: "22:00", silentEnd: "10:00" },
    ]) {
      const { bucket } = memoryBucket(config);
      await sendUserRecommendations(bucket, "user", NOW);
    }
    expect(mocks.latest).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send an empty/fallback digest or expose a muted group", async () => {
    const { bucket } = memoryBucket();
    mocks.groups.mockResolvedValue([{ id: "group", muted: true }]);
    mocks.subscriptions.mockResolvedValue([
      { feedHash: "feed", groupId: "group", url: "https://example.com/rss" },
    ]);
    await sendUserRecommendations(bucket, "user", NOW);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed when storage fails before an attempt", async () => {
    const { bucket } = memoryBucket();
    vi.mocked(bucket.put).mockRejectedValue(new Error("R2 unavailable"));
    await expect(sendUserRecommendations(bucket, "user", NOW)).rejects.toThrow("R2 unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
