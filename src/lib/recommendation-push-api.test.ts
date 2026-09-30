// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PushConfig } from "../types";

const mock = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("./server-auth", () => ({
  withSession: (_request: unknown, callback: (context: unknown) => unknown) =>
    callback({ session: { userId: "user" }, env: mock.env }),
  withJsonBody: async (request: Request, callback: (context: unknown) => unknown) =>
    callback({ body: await request.json(), session: { userId: "user" }, env: mock.env }),
}));
import { GET, PUT } from "../../app/api/push/config/route";
import { POST } from "../../app/api/push/recommendations/dismissals/route";
let config: PushConfig;
let etag: number;
beforeEach(() => {
  etag = 0;
  config = { subscriptions: [], silentStart: "22:00", silentEnd: "07:00" };
  mock.env = {
    RSS_DATA: {
      get: vi.fn(async () => {
        const value = structuredClone(config);
        return { etag: `${etag}`, json: async () => value };
      }),
      put: vi.fn(async (_key: string, value: string, options: R2PutOptions) => {
        if ((options.onlyIf as R2Conditional)?.etagMatches !== `${etag}`) return null;
        config = JSON.parse(value);
        return { etag: `${++etag}` };
      }),
    },
  };
});
const req = (body: unknown) =>
  new NextRequest("https://rss.example/api/push/config", {
    method: "PUT",
    headers: { "X-RSS-Account-Id": "user" },
    body: JSON.stringify(body),
  });
describe("recommendation preferences", () => {
  it("rejects queued work from a different signed-in account before reading feedback or mutating", async () => {
    const request = req({
      recommendationEnabled: true,
      recommendationTime: "09:00",
      timezone: "UTC",
    });
    request.headers.set("X-RSS-Account-Id", "another-account");
    expect((await PUT(request)).status).toBe(409);
    expect(config.recommendationEnabled).toBeUndefined();
    const read = req({});
    read.headers.set("X-RSS-Account-Id", "another-account");
    expect((await GET(read)).status).toBe(409);
    const mutation = req({ reset: true });
    mutation.headers.set("X-RSS-Account-Id", "another-account");
    expect((await POST(mutation)).status).toBe(409);
  });
  it("defaults off and validates opt-in time/timezone without changing unrelated preferences", async () => {
    expect(await (await GET(req({}))).json()).toMatchObject({
      recommendationEnabled: false,
      recommendationTime: "09:00",
      recommendationDismissals: [],
    });
    expect((await PUT(req({ recommendationEnabled: true }))).status).toBe(400);
    expect(
      (
        await PUT(
          req({ recommendationEnabled: true, recommendationTime: "09:15", timezone: "Asia/Tokyo" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          req({ recommendationEnabled: true, recommendationTime: "09:30", timezone: "Asia/Tokyo" }),
        )
      ).status,
    ).toBe(200);
    expect(config).toMatchObject({
      recommendationEnabled: true,
      recommendationTime: "09:30",
      silentStart: "22:00",
      silentEnd: "07:00",
    });
  });
  it("merges enabled dismissal feedback and supports remove/reset; disabled writes are rejected", async () => {
    expect((await POST(req({ add: [{ articleId: "a", dismissedAt: Date.now() }] }))).status).toBe(
      409,
    );
    await PUT(
      req({
        recommendationEnabled: true,
        recommendationTime: "09:00",
        timezone: "UTC",
        recommendationDismissals: [{ articleId: "a", dismissedAt: Date.now() }],
      }),
    );
    expect(config.recommendationDismissals?.map((item) => item.articleId)).toEqual(["a"]);
    await POST(req({ add: [{ articleId: "b", dismissedAt: Date.now() }] }));
    await POST(req({ remove: ["a"] }));
    expect(config.recommendationDismissals?.map((item) => item.articleId)).toEqual(["b"]);
    await POST(req({ reset: true }));
    expect(config.recommendationDismissals).toEqual([]);
    await PUT(req({ recommendationEnabled: false }));
    expect((await POST(req({ add: [{ articleId: "a", dismissedAt: Date.now() }] }))).status).toBe(
      409,
    );
  });
  it("rejects malformed or oversized dismissal input", async () => {
    config.recommendationEnabled = true;
    for (const body of [
      { add: {} },
      { remove: "a" },
      { reset: "true" },
      {
        add: Array.from({ length: 201 }, (_, i) => ({
          articleId: `${i}`,
          dismissedAt: Date.now(),
        })),
      },
    ])
      expect((await POST(req(body))).status).toBe(400);
  });
});
