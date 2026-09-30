// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertFeedWritesAllowed,
  feedWriteMaintenanceResponse,
  FeedWritesPausedError,
  isFeedWritesPaused,
} from "./feed-write-maintenance";

const mutatingRoutes = [
  ["POST", "/api/feeds"],
  ["POST", "/api/feeds/import"],
  ["POST", "/api/feeds/refresh"],
  ["POST", "/api/feeds/abc123/refresh"],
  ["POST", "/api/feeds/abc123/reinfer"],
  ["PATCH", "/api/feeds/abc123"],
  ["DELETE", "/api/feeds/abc123"],
  ["POST", "/api/feeds/abc123/purge-content-cache"],
  ["POST", "/api/test/seed"],
  ["DELETE", "/api/test/seed"],
];

function request(method: string, path: string): Request {
  return new Request(`https://rss.example.com${path}`, { method });
}

describe("feed writer pause configuration", () => {
  it.each([undefined, "false", " FALSE "])(
    "allows an absent/explicitly disabled flag (%s)",
    (value) => {
      expect(isFeedWritesPaused(value)).toBe(false);
    },
  );
  it.each(["true", " TRUE ", "", " ", "0", "1", "yes", "tru", "null", null, false, {}, 0])(
    "pauses for enabled or malformed configured values (%s)",
    (value) => {
      expect(isFeedWritesPaused(value)).toBe(true);
    },
  );
  it("direct entrypoint guard throws a typed retryable error", () => {
    expect(() => assertFeedWritesAllowed({ RSS_FEED_WRITES_PAUSED: "true" })).toThrow(
      FeedWritesPausedError,
    );
    expect(() => assertFeedWritesAllowed({})).not.toThrow();
  });
});

describe("feed writer request boundary", () => {
  it.each(mutatingRoutes)("blocks %s %s with explicit no-store 503", async (method, path) => {
    const response = feedWriteMaintenanceResponse(request(method, path), "true");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("300");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toEqual({
      error: "Feed updates are temporarily paused for maintenance. Please retry later.",
      code: "FEED_WRITES_PAUSED",
      retryable: true,
    });
  });
  it.each(mutatingRoutes)("allows %s %s while disabled", (method, path) => {
    expect(feedWriteMaintenanceResponse(request(method, path), undefined)).toBeNull();
    expect(feedWriteMaintenanceResponse(request(method, path), "false")).toBeNull();
  });
  it.each([
    "/api/feeds/",
    "/api//feeds//abc123//refresh/",
    "/%61pi/%66eeds/import",
    "/api%2Ffeeds%2Frefresh",
    "/api%252Ffeeds%252Frefresh",
    "/api%255cfeeds%255crefresh",
    "/api/other/../feeds/import",
    "/api/other%2f%2e%2e%2ffeeds/import",
    "/API/FEEDS/ABC123/REFRESH",
    "/api/feeds/%ZZ/reinfer",
    "/%61pi/feeds/%ZZ/reinfer",
    "/api/test/%73eed/",
    "/api/feeds?ignored=/api/auth/logout",
  ])("does not bypass maintenance via alternate path spelling %s", (path) => {
    expect(feedWriteMaintenanceResponse(request("POST", path), "true")?.status).toBe(503);
  });
  it.each(["GET", "HEAD", "OPTIONS"])("keeps %s reads/preflight untouched", (method) => {
    for (const path of ["/api/feeds", "/api/feeds/export", "/api/articles", "/api/test/seed"]) {
      expect(feedWriteMaintenanceResponse(request(method, path), "true")).toBeNull();
    }
  });
  it.each([
    "/api/auth/logout",
    "/api/auth/token",
    "/api/articles",
    "/api/read-state",
    "/api/feeds-other",
    "/api/test/seedling",
  ])("leaves unrelated routes and authentication unchanged (%s)", (path) => {
    expect(feedWriteMaintenanceResponse(request("POST", path), "true")).toBeNull();
  });
  it("fails closed for unknown methods within the feed subtree", () => {
    expect(feedWriteMaintenanceResponse(request("PROPFIND", "/api/feeds"), "true")?.status).toBe(
      503,
    );
  });
});

it("keeps operator pause configuration across deploys without a false default", () => {
  const config = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
  expect(config).toMatch(/^keep_vars\s*=\s*true\s*$/m);
  expect(config).not.toMatch(/^\s*RSS_FEED_WRITES_PAUSED\s*=/m);
});
