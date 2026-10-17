import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import type { ChangeEvent } from "react";
import type { OpmlImportResult, UserSubscription } from "../types";

const state = vi.hoisted(() => ({
  bucket: null as R2Bucket | null,
  apiFetch: vi.fn(),
  apiFetchJson: vi.fn(),
  invalidate: vi.fn(),
  purge: vi.fn(),
  fetchArticles: vi.fn(),
  waitUntil: vi.fn(),
  kvDelete: vi.fn(),
  forbidden: vi.fn(),
  devError: vi.fn(),
  cooldown: vi.fn(),
  session: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/lib/server-auth", () => ({
  withSession: async (request: Request, cb: (ctx: unknown) => unknown) => {
    state.session(request);
    return cb({
      session: { userId: "synthetic-owner" },
      env: { RSS_DATA: state.bucket, RATE_LIMIT: { delete: state.kvDelete } },
      ctx: { waitUntil: state.waitUntil },
      origin: "https://reader.example",
    });
  },
  applyCooldown: state.cooldown,
}));
vi.mock("@/lib/cache-helper", () => ({ purgeFeedsCache: state.purge }));
vi.mock("@/cron/fetch", () => ({ fetchArticles: state.fetchArticles }));
vi.mock("@/lib/html", () => ({
  escapeHtml: state.forbidden,
  unescapeHtml: state.forbidden,
  stripHtml: state.forbidden,
  stripHtmlWithBreaks: state.forbidden,
}));
vi.mock("@/lib/html-post-processor", () => ({ applyCorePipeline: state.forbidden }));
vi.mock("@/lib/article-utils", () => ({
  compareByDateDesc: state.forbidden,
  compareByPublishedAtDesc: state.forbidden,
}));
vi.mock("@/lib/shared-feed-storage", () => ({
  readLatestArticles: state.forbidden,
  readArticlePage: state.forbidden,
  readFeedArticleSnapshot: state.forbidden,
  readFeedArticleRevision: state.forbidden,
  repairFeedArticleMetadata: state.forbidden,
  iterateFeedArticleBatches: state.forbidden,
  readArticleObject: state.forbidden,
  readFeedArticleObject: state.forbidden,
  isArticleMutated: state.forbidden,
  mergeNewArticles: state.forbidden,
  mergeNewArticlesWithChanges: state.forbidden,
  LegacyArticleWriteConflictError: class extends Error {},
  migrateFeedArticleStorage: state.forbidden,
}));
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: state.apiFetch,
  apiFetchJson: state.apiFetchJson,
  tryParseErrorBody: async (res: Response) => res.json(),
}));
vi.mock("@/lib/sw-cache", () => ({ invalidateSwCache: state.invalidate }));
vi.mock("@/lib/dev-log", () => ({ devError: state.devError }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => state.toast }));
vi.mock("@/hooks/useFullTextSearch", () => ({
  useFullTextSearch: () => ({ savedSearches: [], importSaved: state.forbidden }),
}));
vi.mock("@/lib/download", () => ({ downloadBlob: state.forbidden }));
vi.mock("@/lib/export-json", () => ({
  buildSavedSearchesJsonFile: state.forbidden,
  parseSavedSearchesJson: state.forbidden,
}));
vi.mock("@/components/user-settings/JsonRestoreControls", () => ({ default: () => null }));
vi.mock("@/components/user-settings/SingleFileSettings", () => ({ default: () => null }));

import { POST } from "../../app/api/feeds/import/route";
import { useFeedOperations } from "../hooks/useFeedOperations";
import ImportExportTabPanel from "../components/user-settings/ImportExportTabPanel";
import { computeFeedHash } from "./shared-feed";
import { describeOpmlImportResult } from "./opml-import-result";

const A = "https://example.org/synthetic-a.xml";
const B = "https://example.org/synthetic-b.xml";
const C = "https://example.org/synthetic-c.xml";
const SUBS = "users/synthetic-owner/subscriptions.json";
const GROUPS = "users/synthetic-owner/feed-groups.json";
const callbacks = () => ({
  onFeedAdded: vi.fn(),
  onFeedDeleted: vi.fn(),
  onFeedRenamed: vi.fn(),
  onFeedsImported: vi.fn(),
  onError: vi.fn(),
});
function opml(urls: string[], folder = false) {
  const outlines = urls.map((url) => `<outline title="Synthetic" xmlUrl="${url}"/>`).join("");
  return `<?xml version="1.0"?><opml version="2.0"><body>${folder ? `<outline text="Folder">${outlines}</outline>` : outlines}</body></opml>`;
}
function memoryBucket(initial: UserSubscription[], rejectMeta: Set<string> = new Set()) {
  const data = new Map([[SUBS, JSON.stringify(initial)]]);
  let revision = 1;
  let beforeSubscriptionPut: (() => void) | undefined;
  const validKey = (key: string) =>
    key === SUBS ||
    key === GROUPS ||
    key === "meta/user-index.json" ||
    /^feeds\/[0-9a-f]{16}\/meta\.json$/.test(key);
  const get = vi.fn(async (key: string) => {
    if (!validKey(key)) throw new Error("UNEXPECTED_R2_KEY");
    const value = data.get(key);
    return value === undefined
      ? null
      : {
          etag: String(revision),
          size: Buffer.byteLength(value),
          json: async () => JSON.parse(value) as unknown,
        };
  });
  const put = vi.fn(async (key: string, body: string, options?: R2PutOptions) => {
    if (!validKey(key)) throw new Error("UNEXPECTED_R2_KEY");
    if (rejectMeta.has(key)) throw new Error("SYNTHETIC_META_FAILURE_PRIVATE_DETAIL");
    if (key === SUBS) beforeSubscriptionPut?.();
    const condition = options?.onlyIf as R2Conditional | undefined;
    if (condition?.etagMatches && condition.etagMatches !== String(revision)) return null;
    if (condition?.etagDoesNotMatch === "*" && data.has(key)) return null;
    data.set(key, body);
    revision++;
    return { etag: String(revision) };
  });
  return {
    bucket: { get, put } as unknown as R2Bucket,
    get,
    put,
    data,
    subscriptions: () => JSON.parse(data.get(SUBS)!) as UserSubscription[],
    seedSubscriptions: (next: UserSubscription[]) => {
      data.set(SUBS, JSON.stringify(next));
      revision++;
    },
    beforeSubscriptionPut: (fn: () => void) => {
      beforeSubscriptionPut = fn;
    },
  };
}
async function seed() {
  const [aHash, bHash, cHash] = await Promise.all([A, B, C].map(computeFeedHash));
  const b: UserSubscription = {
    feedHash: bHash,
    url: B,
    subscribedAt: "2026-10-17T00:00:00Z",
    customTitle: "Preserve B",
    priority: "high",
    groupId: "existing-group",
    mutedUntil: "2026-10-18T00:00:00Z",
  };
  return { aHash, bHash, cHash, b };
}
function connectRoute() {
  const responses: Array<{ status: number; body: OpmlImportResult & { code?: string } }> = [];
  state.apiFetch.mockImplementation(async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/feeds/import");
    const response = await POST(new Request("https://reader.example/api/feeds/import", init));
    responses.push({
      status: response.status,
      body: (await response.clone().json()) as OpmlImportResult,
    });
    return response;
  });
  return responses;
}
function assertNetworkFence() {
  const fence = (
    process as typeof process & { __opmlNetworkFence?: { installed: boolean; attempts: string[] } }
  ).__opmlNetworkFence;
  if (fence) expect(fence).toEqual({ installed: true, attempts: [] });
  expect(fetch).not.toHaveBeenCalled();
  expect(state.forbidden).not.toHaveBeenCalled();
}
async function importThrough(entry: "sidebar" | "settings", text: string) {
  if (entry === "sidebar") {
    const cb = callbacks();
    const hook = renderHook(() => useFeedOperations(cb));
    const input = { value: "selected" } as HTMLInputElement;
    hook.result.current.fileInputRef.current = input;
    await act(async () =>
      hook.result.current.handleImportFile({
        target: { files: [{ text: async () => text }] },
      } as unknown as ChangeEvent<HTMLInputElement>),
    );
    expect(hook.result.current.importing).toBe(false);
    expect(input.value).toBe("");
    return {
      message: hook.result.current.importMessage,
      importedCalls: cb.onFeedsImported.mock.calls,
    };
  }
  render(
    <ImportExportTabPanel
      userId="synthetic-owner"
      hidden={false}
      articles={[]}
      notes={{}}
      setNote={vi.fn()}
      bookmarkIds={new Set()}
      readingListIds={new Set()}
      toggleBookmark={vi.fn()}
      toggleReadingList={vi.fn()}
      collections={[]}
      addArticlesToCollection={vi.fn(async () => {})}
    />,
  );
  const input = document.querySelector<HTMLInputElement>('[data-setting-id="opml"] input')!;
  await act(async () => {
    fireEvent.change(input, { target: { files: [{ size: text.length, text: async () => text }] } });
  });
  expect(input.value).toBe("");
  const button = document.querySelector<HTMLButtonElement>(
    '[data-setting-id="opml"] button:last-child',
  )!;
  await waitFor(() => expect(button.disabled).toBe(false));
  const isError = state.toast.error.mock.calls.length > 0;
  const calls = isError ? state.toast.error.mock.calls : state.toast.success.mock.calls;
  expect(calls).toHaveLength(1);
  expect(isError ? state.toast.success : state.toast.error).not.toHaveBeenCalled();
  return { message: { text: calls[0][0] as string, isError }, importedCalls: [] };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.forbidden.mockImplementation(() => {
    throw new Error("UNEXPECTED_BOUNDARY");
  });
  state.cooldown.mockResolvedValue(null);
  for (const fn of [state.purge, state.fetchArticles, state.kvDelete])
    fn.mockResolvedValue(undefined);
  state.waitUntil.mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("FIXTURE_NETWORK_FORBIDDEN");
    }),
  );
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      constructor() {
        throw new Error("FIXTURE_NETWORK_FORBIDDEN");
      }
    },
  );
  vi.stubGlobal(
    "WebSocket",
    class {
      constructor() {
        throw new Error("FIXTURE_NETWORK_FORBIDDEN");
      }
    },
  );
});
afterEach(() => {
  assertNetworkFence();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(["sidebar", "settings"] as const)("%s actual import entry", (entry) => {
  it.each([
    { name: "metadata failure", urls: [A], counts: [0, 0, 1], error: true },
    {
      name: "partial success with existing duplicate",
      urls: [A, C, B],
      counts: [1, 1, 1],
      error: true,
    },
    { name: "duplicate normal control", urls: [B, B], counts: [0, 2, 0], error: false },
    { name: "normal success with batch duplicate", urls: [C, C], counts: [1, 1, 0], error: false },
    {
      name: "invalid URL is still a general skip",
      urls: ["file:///synthetic"],
      counts: [0, 1, 0],
      error: false,
    },
  ])("$name", async ({ urls, counts, error }) => {
    const { aHash, cHash, b } = await seed();
    const s = memoryBucket([b], new Set([`feeds/${aHash}/meta.json`]));
    state.bucket = s.bucket;
    const responses = connectRoute();
    const outcome = await importThrough(entry, opml(urls));
    expect(responses).toHaveLength(1);
    expect(responses[0].status).toBe(200);
    const body = responses[0].body;
    expect([body.added, body.skipped, body.failed]).toEqual(counts);
    expect(body.added + body.skipped + (body.failed ?? 0)).toBe(urls.length);
    expect(outcome.message).toEqual(describeOpmlImportResult(body));
    expect(outcome.message?.isError).toBe(error);
    expect(outcome.message?.text).not.toContain("すべて登録済み");
    expect(JSON.stringify(body)).not.toContain("SYNTHETIC_META_FAILURE_PRIVATE_DETAIL");
    if (!body.added) expect(JSON.stringify(body)).not.toContain(A);
    expect(s.subscriptions().find((sub) => sub.feedHash === b.feedHash)).toEqual(b);
    expect(s.subscriptions().some((sub) => sub.feedHash === aHash)).toBe(false);
    expect(s.subscriptions().length).toBe(1 + body.added);
    if (entry === "sidebar")
      expect(outcome.importedCalls).toEqual(body.added ? [[body.feeds]] : []);
    expect(state.session).toHaveBeenCalledTimes(1);
    expect(state.cooldown).toHaveBeenCalledWith(
      expect.anything(),
      "users/synthetic-owner/opml-import.json",
      60000,
    );
    expect(state.fetchArticles).toHaveBeenCalledTimes(body.added ? 1 : 0);
    expect(state.purge).toHaveBeenCalledTimes(body.added ? 1 : 0);
    expect(s.put.mock.calls.filter(([key]) => key === SUBS)).toHaveLength(body.added ? 1 : 0);
    if (body.added) expect(body.feeds.map((feed) => feed.id)).toEqual([cHash]);
  });
  it.each([
    { text: "", code: "INVALID_OPML" },
    { text: "not xml", code: "INVALID_OPML" },
    { text: "<opml><body/></opml>", code: "INVALID_OPML" },
    { text: '<opml><body><outline text="Folder"/></body></opml>', code: "EMPTY_OPML" },
  ])("rejects empty/invalid OPML: $code $text", async ({ text, code }) => {
    const { b } = await seed();
    const s = memoryBucket([b]);
    state.bucket = s.bucket;
    const responses = connectRoute();
    const outcome = await importThrough(entry, text);
    expect(responses[0].status).toBe(400);
    expect(responses[0].body.code).toBe(code);
    expect(outcome.message?.isError).toBe(true);
    expect(s.subscriptions()).toEqual([b]);
    expect(s.get).not.toHaveBeenCalled();
    expect(s.put).not.toHaveBeenCalled();
  });
});

describe("unchanged import storage guards", () => {
  it("preserves fresh concurrent additions through real subscription CAS retry", async () => {
    const { aHash, cHash, b } = await seed();
    const s = memoryBucket([b]);
    state.bucket = s.bucket;
    let raced = false;
    const c: UserSubscription = {
      feedHash: cHash,
      url: C,
      subscribedAt: b.subscribedAt,
      customTitle: "Concurrent C",
      priority: "high",
    };
    s.beforeSubscriptionPut(() => {
      if (!raced) {
        raced = true;
        s.seedSubscriptions([b, c]);
      }
    });
    const response = await POST(
      new Request("https://reader.example/api/feeds/import", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: opml([A]),
      }),
    );
    const body = (await response.json()) as OpmlImportResult;
    expect([body.added, body.skipped, body.failed]).toEqual([1, 0, 0]);
    expect(s.subscriptions().slice(0, 2)).toEqual([b, c]);
    expect(s.subscriptions()[2].feedHash).toBe(aHash);
    expect(s.put.mock.calls.filter(([key]) => key === SUBS)).toHaveLength(2);
  });
  it("keeps the original remaining-slot break and counts overflow as general skip", async () => {
    const { aHash, cHash, b } = await seed();
    const existing = [
      b,
      ...Array.from({ length: 998 }, (_, n): UserSubscription => ({
        feedHash: n.toString(16).padStart(16, "0"),
        url: `https://example.org/${n}`,
        subscribedAt: b.subscribedAt,
      })),
    ];
    const s = memoryBucket(existing);
    state.bucket = s.bucket;
    const response = await POST(
      new Request("https://reader.example/api/feeds/import", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: opml([A, C]),
      }),
    );
    const body = (await response.json()) as OpmlImportResult;
    expect([body.added, body.skipped, body.failed]).toEqual([1, 1, 0]);
    expect(s.subscriptions()).toHaveLength(1000);
    expect(s.get.mock.calls.some(([key]) => key === `feeds/${cHash}/meta.json`)).toBe(false);
    expect(body.feeds[0].id).toBe(aHash);
    expect(s.subscriptions().slice(0, 999)).toEqual(existing);
  });
  it("retains folder grouping for accepted additions", async () => {
    const { b } = await seed();
    const s = memoryBucket([b]);
    state.bucket = s.bucket;
    s.data.set(
      GROUPS,
      JSON.stringify([
        { id: "existing-group", name: "Preserve", order: 0, createdAt: b.subscribedAt },
      ]),
    );
    const response = await POST(
      new Request("https://reader.example/api/feeds/import", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: opml([C], true),
      }),
    );
    const body = (await response.json()) as OpmlImportResult;
    const groups = JSON.parse(s.data.get(GROUPS)!) as Array<{ id: string; name: string }>;
    expect(groups[0]).toMatchObject({ id: "existing-group", name: "Preserve" });
    expect(groups[1].name).toBe("Folder");
    expect(body.feeds[0].groupId).toBe(groups[1].id);
    expect(s.subscriptions()[0]).toEqual(b);
  });
  it("returns cooldown response before reading or writing storage", async () => {
    const { b } = await seed();
    const s = memoryBucket([b]);
    state.bucket = s.bucket;
    state.cooldown.mockResolvedValueOnce(Response.json({ code: "RATE_LIMITED" }, { status: 429 }));
    const response = await POST(
      new Request("https://reader.example/api/feeds/import", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: opml([A]),
      }),
    );
    expect(response.status).toBe(429);
    expect(s.get).not.toHaveBeenCalled();
    expect(s.put).not.toHaveBeenCalled();
  });
});

describe("shared pure result feedback", () => {
  it.each([
    { added: 0, skipped: 0, failed: 0 },
    { added: -1, skipped: 1, failed: 0 },
    { added: 1, skipped: 0, failed: Number.NaN },
  ])("rejects empty or invalid counts %#", (counts) =>
    expect(describeOpmlImportResult(counts).isError).toBe(true),
  );
  it("supports an older server without failed while avoiding all-registered claims", () => {
    expect(describeOpmlImportResult({ added: 0, skipped: 1 })).toEqual({
      text: "追加はありません（1件スキップ）",
      isError: false,
    });
  });
});
