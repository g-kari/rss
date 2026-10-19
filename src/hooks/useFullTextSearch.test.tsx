import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useFullTextSearch } from "./useFullTextSearch";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("shares mounted consumers and callbacks captured before an import under StrictMode", () => {
  const one = renderHook(useFullTextSearch, { wrapper: StrictMode });
  const two = renderHook(useFullTextSearch, { wrapper: StrictMode });
  const save = one.result.current.save;
  act(() =>
    two.result.current.importSaved([
      { id: "old", name: "Imported", query: "q", createdAt: "2026-10-18" },
    ]),
  );
  expect(one.result.current.savedSearches).toBe(two.result.current.savedSearches);
  act(() => save("New", "new"));
  expect(two.result.current.savedSearches.map((item) => item.name)).toEqual(["New", "Imported"]);
  act(() => one.result.current.removeSaved("old"));
  expect(two.result.current.savedSearches.map((item) => item.name)).toEqual(["New"]);
});
it("keeps the legacy four-string schema and filters malformed storage entries", () => {
  localStorage.setItem(
    "rss-saved-searches",
    JSON.stringify([
      null,
      "bad",
      { id: "partial" },
      { id: "legacy", name: "Legacy", query: "q", createdAt: "old-date-string" },
    ]),
  );
  const hook = renderHook(useFullTextSearch);
  expect(hook.result.current.savedSearches).toEqual([
    { id: "legacy", name: "Legacy", query: "q", createdAt: "old-date-string" },
  ]);
});
it("renders the stable empty server snapshot rather than browser-local searches", () => {
  localStorage.setItem(
    "rss-saved-searches",
    JSON.stringify([{ id: "private", name: "Browser only", query: "q", createdAt: "2026" }]),
  );
  function ServerFixture() {
    return <output>{useFullTextSearch().savedSearches.length}</output>;
  }
  expect(renderToString(<ServerFixture />)).toBe("<output>0</output>");
});
