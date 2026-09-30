// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://rss.example.com";
const RECOMMENDATIONS_URL = `${ORIGIN}/?recommendations=1`;
const serviceWorkerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

interface MockWindowClient {
  url: string;
  focus: () => Promise<unknown>;
  navigate: (url: string) => Promise<MockWindowClient | null>;
}

function windowClient(url = ORIGIN): MockWindowClient {
  const client: MockWindowClient = {
    url,
    focus: vi.fn(async () => client),
    navigate: vi.fn(async () => client),
  };
  return client;
}

function serviceWorker(windowClients: MockWindowClient[] = []) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const showNotification = vi.fn(async () => undefined);
  const matchAll = vi.fn(async () => windowClients);
  const openWindow = vi.fn<(url: string) => Promise<null>>(async () => null);
  const warn = vi.fn();
  runInNewContext(serviceWorkerSource, {
    URL,
    console: { warn },
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.set(type, listener);
      },
      registration: { showNotification },
      clients: { matchAll, openWindow },
    },
  });

  async function dispatch(type: string, event: Record<string, unknown>) {
    const pending: Promise<unknown>[] = [];
    const waitUntil = vi.fn((promise: Promise<unknown>) => pending.push(promise));
    const listener = listeners.get(type);
    if (!listener) throw new Error(`Missing service worker listener: ${type}`);
    listener({ ...event, waitUntil });
    await Promise.all(pending);
    return waitUntil;
  }

  async function click(data?: Record<string, unknown>) {
    const close = vi.fn();
    const waitUntil = await dispatch("notificationclick", { notification: { data, close } });
    expect(close).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
  }

  return { showNotification, matchAll, openWindow, warn, dispatch, click };
}

describe("service worker push notifications", () => {
  it.each([
    ["missing payload", null],
    ["missing fields", { json: () => ({}) }],
    ["null JSON", { json: () => null }],
    [
      "malformed JSON",
      {
        json: () => {
          throw new SyntaxError("Invalid JSON");
        },
      },
    ],
  ])("uses the legacy notification defaults for %s", async (_name, data) => {
    const worker = serviceWorker();
    const waitUntil = await worker.dispatch("push", { data });

    expect(waitUntil).toHaveBeenCalledOnce();
    expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith("RSS Reader", {
      body: "新着記事があります",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "rss-new-articles",
      renotify: true,
      data: { url: "/" },
    });
  });

  it("keeps recommendations in a separate, non-renotifying notification group", async () => {
    const worker = serviceWorker();
    await worker.dispatch("push", {
      data: {
        json: () => ({
          title: "いま読むおすすめ",
          body: "おすすめの記事が3件あります",
          url: "/?recommendations=1",
          tag: "rss-recommendations-2026-09-30",
          renotify: false,
        }),
      },
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "いま読むおすすめ",
      expect.objectContaining({
        body: "おすすめの記事が3件あります",
        tag: "rss-recommendations-2026-09-30",
        renotify: false,
        data: { url: "/?recommendations=1" },
      }),
    );
  });

  it.each([undefined, null, "", "   ", 42])(
    "uses a nonempty legacy tag when the optional tag is invalid (%s)",
    async (tag) => {
      const worker = serviceWorker();
      await worker.dispatch("push", { data: { json: () => ({ tag, renotify: "false" }) } });

      expect(worker.showNotification).toHaveBeenCalledWith(
        "RSS Reader",
        expect.objectContaining({ tag: "rss-new-articles", renotify: true }),
      );
    },
  );

  it("preserves explicit error notification tags and renotify", async () => {
    const worker = serviceWorker();
    await worker.dispatch("push", {
      data: {
        json: () => ({ title: "フィード更新エラー", tag: "rss-feed-errors", renotify: true }),
      },
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "フィード更新エラー",
      expect.objectContaining({ tag: "rss-feed-errors", renotify: true }),
    );
  });
});

describe("service worker notification clicks", () => {
  it("navigates an existing same-origin window and focuses the returned client", async () => {
    const external = windowClient("https://external.example/");
    const malformed = windowClient("not a URL");
    const app = windowClient(`${ORIGIN}/?article=previous`);
    const navigated = windowClient(RECOMMENDATIONS_URL);
    vi.mocked(app.navigate).mockResolvedValue(navigated);
    const worker = serviceWorker([external, malformed, app]);

    await worker.click({ url: "/?recommendations=1" });

    expect(worker.matchAll).toHaveBeenCalledExactlyOnceWith({
      type: "window",
      includeUncontrolled: true,
    });
    expect(external.navigate).not.toHaveBeenCalled();
    expect(external.focus).not.toHaveBeenCalled();
    expect(malformed.navigate).not.toHaveBeenCalled();
    expect(app.navigate).toHaveBeenCalledExactlyOnceWith(RECOMMENDATIONS_URL);
    expect(navigated.focus).toHaveBeenCalledOnce();
    expect(app.focus).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("opens the validated target when no app window exists", async () => {
    const worker = serviceWorker();
    await worker.click({ url: "/?recommendations=1" });

    expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith(RECOMMENDATIONS_URL);
  });

  it("preserves same-origin absolute URLs and their query and fragment", async () => {
    const worker = serviceWorker();
    const url = `${RECOMMENDATIONS_URL}#recommendations`;
    await worker.click({ url });

    expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each([
    undefined,
    null,
    "https://external.example/",
    "//external.example/",
    "javascript:alert(1)",
    "data:text/html,hello",
    `blob:${ORIGIN}/id`,
    "https://[",
    `${ORIGIN}:444/`,
  ])("falls back to the app root for an unsafe or missing URL (%s)", async (url) => {
    const worker = serviceWorker();
    await worker.click({ url });

    expect(worker.openWindow).toHaveBeenCalledOnce();
    const openedUrl = vi.mocked(worker.openWindow).mock.calls[0]?.[0];
    expect(new URL(openedUrl ?? "", ORIGIN).href).toBe(`${ORIGIN}/`);
  });

  it("also validates URLs before navigating existing app windows", async () => {
    const app = windowClient();
    const worker = serviceWorker([app]);
    await worker.click({ url: "//external.example/" });

    expect(app.navigate).toHaveBeenCalledOnce();
    const navigatedUrl = vi.mocked(app.navigate).mock.calls[0]?.[0];
    expect(new URL(navigatedUrl ?? "", ORIGIN).href).toBe(`${ORIGIN}/`);
    expect(app.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it.each(["reject", "null"])(
    "opens the target if existing window navigation returns %s",
    async (failure) => {
      const app = windowClient();
      if (failure === "reject")
        vi.mocked(app.navigate).mockRejectedValue(new Error("Window closed"));
      else vi.mocked(app.navigate).mockResolvedValue(null);
      const worker = serviceWorker([app]);

      await worker.click({ url: "/?recommendations=1" });

      expect(app.navigate).toHaveBeenCalledExactlyOnceWith(RECOMMENDATIONS_URL);
      expect(app.focus).not.toHaveBeenCalled();
      expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith(RECOMMENDATIONS_URL);
    },
  );

  it("tries another app window when navigation of the first one fails", async () => {
    const closed = windowClient();
    const app = windowClient();
    vi.mocked(closed.navigate).mockRejectedValue(new Error("Window closed"));
    const worker = serviceWorker([closed, app]);

    await worker.click({ url: "/?recommendations=1" });

    expect(app.navigate).toHaveBeenCalledExactlyOnceWith(RECOMMENDATIONS_URL);
    expect(app.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("opens a window if focusing the navigated client fails", async () => {
    const app = windowClient();
    vi.mocked(app.focus).mockRejectedValue(new Error("Window closed"));
    const worker = serviceWorker([app]);

    await worker.click({ url: "/?recommendations=1" });

    expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith(RECOMMENDATIONS_URL);
  });
});
