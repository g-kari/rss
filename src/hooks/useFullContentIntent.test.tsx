import { cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useFullContentIntent } from "./useFullContentIntent";
import { makeArticle } from "../../e2e/helpers/article";
const article = makeArticle();
const request = {
  requestId: 1,
  articleId: article.id,
  link: article.link,
  target: "pane" as const,
};
afterEach(cleanup);
it("does not fetch ordinary selections and performs one explicit request once through rerenders and StrictMode", () => {
  const fetch = vi.fn().mockResolvedValue(undefined);
  const consume = vi.fn().mockReturnValue(true);
  const { rerender } = renderHook(
    ({ intent }) =>
      useFullContentIntent(article, intent, "pane", false, true, false, fetch, consume),
    { initialProps: { intent: null as typeof request | null }, wrapper: StrictMode },
  );
  expect(fetch).not.toHaveBeenCalled();
  rerender({ intent: request });
  rerender({ intent: { ...request } });
  expect(fetch).toHaveBeenCalledOnce();
  expect(consume).toHaveBeenCalledExactlyOnceWith(1);
});
it("targets the actual presentation, matches ID and URL, and handles same-article new requests", () => {
  const fetch = vi.fn().mockResolvedValue(undefined);
  const consume = vi.fn().mockReturnValue(true);
  const { rerender } = renderHook(
    ({ target, link, requestId }) =>
      useFullContentIntent(
        article,
        { ...request, target, link, requestId },
        "overlay",
        false,
        true,
        false,
        fetch,
        consume,
      ),
    { initialProps: { target: "pane" as "pane" | "overlay", link: article.link, requestId: 1 } },
  );
  expect(fetch).not.toHaveBeenCalled();
  rerender({ target: "overlay", link: "https://other.example/", requestId: 1 });
  expect(fetch).not.toHaveBeenCalled();
  rerender({ target: "overlay", link: article.link, requestId: 1 });
  expect(fetch).toHaveBeenCalledOnce();
  rerender({ target: "overlay", link: article.link, requestId: 2 });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("waits for an existing fetch and consumes cached/full content without a duplicate request", () => {
  const fetch = vi.fn().mockResolvedValue(undefined);
  const consume = vi.fn().mockReturnValue(true);
  const { rerender } = renderHook(
    ({ fetching, full }) =>
      useFullContentIntent(article, request, "pane", full, !full, fetching, fetch, consume),
    { initialProps: { fetching: true, full: false } },
  );
  expect(consume).not.toHaveBeenCalled();
  rerender({ fetching: false, full: true });
  expect(consume).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not repeat a failed request or claim a request consumed in another view", () => {
  const fetch = vi.fn().mockResolvedValue(undefined);
  const consume = vi.fn().mockReturnValue(false);
  const { rerender } = renderHook(() =>
    useFullContentIntent(article, request, "pane", false, true, false, fetch, consume),
  );
  rerender();
  expect(fetch).not.toHaveBeenCalled();
  expect(consume).toHaveBeenCalledOnce();
});
