import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode, useRef, useState } from "react";
import SearchBar from "./SearchBar";
import ImportExportTabPanel from "../user-settings/ImportExportTabPanel";
import { ArticleFilterProvider, type ArticleFilter } from "../../contexts/ArticleFilterContext";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => toast }));
vi.mock("../user-settings/SingleFileSettings", () => ({ default: () => null }));
vi.mock("../user-settings/JsonRestoreControls", () => ({ default: () => null }));
const imported = {
  id: "imported-id",
  name: "Imported",
  query: "title:imported",
  createdAt: "2026-10-18",
};
function Fixture() {
  const [rawQuery, updateQuery] = useState("title:new");
  const [open, setOpen] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <ArticleFilterProvider value={{ rawQuery, updateQuery, searchRef } as ArticleFilter}>
      <SearchBar />
      <button onClick={() => setOpen(!open)}>Toggle settings</button>
      {open && (
        <ImportExportTabPanel
          userId="synthetic"
          hidden={false}
          articles={[]}
          notes={{}}
          setNote={() => {}}
          bookmarkIds={new Set()}
          readingListIds={new Set()}
          toggleBookmark={() => {}}
          toggleReadingList={() => {}}
          collections={[]}
          addArticlesToCollection={async () => {}}
        />
      )}
    </ArticleFilterProvider>
  );
}
async function importFile() {
  const input = document.querySelector<HTMLInputElement>(
    '[data-setting-id="saved-searches"] input[type="file"]',
  )!;
  await act(async () => {
    fireEvent.change(input, {
      target: {
        files: [
          {
            name: "synthetic.json",
            size: 100,
            text: async () => JSON.stringify({ searches: [imported] }),
          },
        ],
      },
    });
  });
}
function saveNew() {
  fireEvent.click(screen.getByTitle("この検索条件を保存"));
  fireEvent.change(screen.getByLabelText("検索を保存するための名前"), { target: { value: "New" } });
  fireEvent.submit(screen.getByRole("form", { name: "検索条件を保存" }));
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("keeps a successfully imported condition when settings unmount and the already-mounted search saves", async () => {
  render(
    <StrictMode>
      <Fixture />
    </StrictMode>,
  );
  await importFile();
  expect(toast.success).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Toggle settings" }));
  fireEvent.focus(screen.getByRole("combobox"));
  expect(screen.getByRole("option", { name: /Imported/ })).toBeInTheDocument();
  saveNew();
  expect(JSON.parse(localStorage.getItem("rss-saved-searches")!)).toMatchObject([
    { name: "New" },
    imported,
  ]);
});
it("does not report import success or discard existing storage when local persistence fails, then recovers", async () => {
  localStorage.setItem("rss-saved-searches", JSON.stringify([imported]));
  render(<Fixture />);
  const original = localStorage.getItem("rss-saved-searches");
  const set = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new DOMException("Synthetic quota", "QuotaExceededError");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await importFile();
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("rss-saved-searches")).toBe(original);
  expect(screen.getByRole("alert")).toHaveTextContent("保存できませんでした");
  saveNew();
  expect(screen.getByLabelText("検索を保存するための名前")).toBeInTheDocument();
  expect(localStorage.getItem("rss-saved-searches")).toBe(original);
  set.mockRestore();
  log.mockRestore();
  fireEvent.submit(screen.getByRole("form", { name: "検索条件を保存" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("検索を保存するための名前")).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("rss-saved-searches")!)).toMatchObject([
    { name: "New" },
    imported,
  ]);
});
