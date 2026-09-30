/** apiFetch keeps intentional AbortController cancellation quiet without hiding real failures. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useAuth", () => ({
  getAuthReady: () => Promise.resolve(),
  getTokenExpiry: () => null,
}));

import { apiFetch, onApiError } from "./api-fetch";

const fetchMock = vi.fn<typeof fetch>();
const notify = vi.fn();
let unsubscribe: () => void;

beforeEach(() => {
  fetchMock.mockReset();
  notify.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  unsubscribe = onApiError(notify);
});
afterEach(() => {
  unsubscribe();
  vi.unstubAllGlobals();
});

function pendingRequest(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function waitForFetchCalls(count: number): Promise<void> {
  for (let i = 0; i < 20 && fetchMock.mock.calls.length < count; i++) await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledTimes(count);
}

describe("apiFetch error notifications", () => {
  it("does not notify when the caller cancels its in-flight request", async () => {
    fetchMock.mockImplementation((_input, init) => pendingRequest(init));
    const controller = new AbortController();
    const request = apiFetch("/api/content", { signal: controller.signal });
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await waitForFetchCalls(1);
    controller.abort();
    await rejection;
    expect(notify).not.toHaveBeenCalled();
  });

  it("keeps a pre-cancelled request quiet", async () => {
    fetchMock.mockImplementation((_input, init) => pendingRequest(init));
    const controller = new AbortController();
    controller.abort();
    await expect(apiFetch("/api/ogp", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("also keeps a cancelled auth-recovery retry quiet", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ user: { id: "test-user" } }))
      .mockImplementation((_input, init) => pendingRequest(init));
    const controller = new AbortController();
    const request = apiFetch("/api/content", { signal: controller.signal });
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await waitForFetchCalls(3);
    controller.abort();
    await rejection;
    expect(notify).not.toHaveBeenCalled();
  });

  it("still notifies a genuine network failure", async () => {
    const error = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValue(error);
    await expect(apiFetch("/api/content")).rejects.toBe(error);
    expect(notify).toHaveBeenCalledWith({
      input: "/api/content",
      status: undefined,
      message: "ネットワークエラー",
    });
  });

  it("still notifies a genuine network failure during the auth-recovery retry", async () => {
    const error = new TypeError("Failed to fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ user: { id: "test-user" } }))
      .mockRejectedValueOnce(error);
    await expect(apiFetch("/api/content")).rejects.toBe(error);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not hide an AbortError unless the caller signal was cancelled", async () => {
    const error = new DOMException("Transport aborted", "AbortError");
    fetchMock.mockRejectedValue(error);
    await expect(apiFetch("/api/content", { signal: new AbortController().signal })).rejects.toBe(
      error,
    );
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not hide an explicit timeout signal", async () => {
    const controller = new AbortController();
    const error = new DOMException("Request timed out", "TimeoutError");
    controller.abort(error);
    fetchMock.mockRejectedValue(error);
    await expect(apiFetch("/api/content", { signal: controller.signal })).rejects.toBe(error);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([500, 504])("keeps HTTP %s errors visible", async (status) => {
    const response = new Response(null, { status });
    fetchMock.mockResolvedValue(response);
    expect(await apiFetch("/api/content")).toBe(response);
    expect(notify).toHaveBeenCalledWith({
      input: "/api/content",
      status,
      message:
        status === 504
          ? "タイムアウト：時間をおいて再試行してください"
          : "サーバーエラー（時間をおいて再試行）",
    });
  });
});
