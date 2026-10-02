import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import ImportExportTabPanel from "./ImportExportTabPanel";
import { makeArticle } from "../../../e2e/helpers/article";
import { useReadStatePersistence } from "../../hooks/useReadStatePersistence";
import { MAX_NOTE_LENGTH, MAX_NOTES, MAX_BOOKMARK_IDS } from "../../lib/validation";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => toast }));
vi.mock("../../hooks/useFullTextSearch", () => ({
  useFullTextSearch: () => ({ savedSearches: [], importSaved: vi.fn() }),
}));
vi.mock("./SingleFileSettings", () => ({ default: () => null }));
vi.mock("../../lib/dev-log", () => ({ devError: vi.fn() }));

const article = makeArticle({ id: "match", title: "一致する記事", link: "https://example.test/a" });
const props = {
  userId: "one",
  hidden: false,
  articles: [article],
  notes: { match: "現在のメモ" },
  setNote: vi.fn(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  toggleBookmark: vi.fn(),
  toggleReadingList: vi.fn(),
  collections: [
    { id: "collection", name: "取込先", articleIds: [], createdAt: "2026-01-01", order: 0 },
  ],
  addArticlesToCollection: vi.fn(async () => {}),
};

async function selectFile(kind: "notes" | "article-state" | "collections", content: unknown) {
  const input = document.querySelector<HTMLInputElement>(
    `[data-setting-id="${kind}-import"] input`,
  )!;
  await act(async () => {
    fireEvent.change(input, {
      target: {
        files: [{ name: "backup.json", size: 100, text: async () => JSON.stringify(content) }],
      },
    });
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("matches the real note setter limit and reports overlong notes as excluded", async () => {
  localStorage.clear();
  const fresh = makeArticle({ id: "fresh", link: "https://example.test/b" });
  const { result } = renderHook(() =>
    useReadStatePersistence([article, fresh], undefined, vi.fn(), vi.fn()),
  );
  render(
    <ImportExportTabPanel
      {...props}
      articles={[article, fresh]}
      notes={result.current.notes}
      setNote={result.current.setNote}
    />,
  );
  await selectFile("notes", {
    notes: [
      { url: article.link, note: "a".repeat(MAX_NOTE_LENGTH) },
      { url: fresh.link, note: "b".repeat(MAX_NOTE_LENGTH + 1) },
    ],
  });
  expect(
    screen.getByText(`上限${MAX_NOTE_LENGTH}文字を超えるメモ: 1件 (取込対象外)`),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "メモを復元 (1件)" }));
  expect(result.current.notes).toEqual({ match: "a".repeat(MAX_NOTE_LENGTH) });
  expect(toast.success).toHaveBeenCalledWith("1件を取り込みました");
  localStorage.clear();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function startFile(
  kind: "notes" | "article-state" | "collections",
  text: () => Promise<string>,
  size = 100,
) {
  const input = document.querySelector<HTMLInputElement>(
    `[data-setting-id="${kind}-import"] input`,
  )!;
  fireEvent.change(input, { target: { files: [{ name: "backup.json", size, text }] } });
  return input;
}

it("reviews notes without overwriting on file selection or cancellation", async () => {
  render(<ImportExportTabPanel {...props} />);
  await selectFile("notes", { notes: [{ url: article.link, note: "バックアップのメモ" }] });
  expect(props.setNote).not.toHaveBeenCalled();
  expect(screen.getByRole("region", { name: "JSON 復元プレビュー" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取込をキャンセル" }));
  expect(props.setNote).not.toHaveBeenCalled();
});

it("reviews article state before explicitly adding it", async () => {
  render(<ImportExportTabPanel {...props} />);
  await selectFile("article-state", { label: "ブックマーク", articles: [{ url: article.link }] });
  expect(props.toggleBookmark).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ブックマークに追加 (1件)" }));
  expect(props.toggleBookmark).toHaveBeenCalledExactlyOnceWith(article.id);
});

it("reviews the collection destination and count before explicitly adding", async () => {
  render(<ImportExportTabPanel {...props} />);
  fireEvent.change(screen.getByRole("combobox", { name: "コレクション JSON の取り込み先" }), {
    target: { value: "collection" },
  });
  await selectFile("collections", { label: "元のコレクション", articles: [{ url: article.link }] });
  expect(props.addArticlesToCollection).not.toHaveBeenCalled();
  expect(screen.getByText("取り込み先: 取込先")).toBeInTheDocument();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "コレクションに追加 (1件)" })),
  );
  expect(props.addArticlesToCollection).toHaveBeenCalledExactlyOnceWith("collection", [article.id]);
});

it("keeps existing notes by default and requires an explicit replacement choice", async () => {
  const fresh = makeArticle({ id: "fresh", title: "新しい記事", link: "https://example.test/b" });
  const same = makeArticle({ id: "same", link: "https://example.test/c" });
  render(
    <ImportExportTabPanel
      {...props}
      articles={[article, fresh, same]}
      notes={{ ...props.notes, same: "同じメモ" }}
    />,
  );
  await selectFile("notes", {
    notes: [
      { url: article.link, note: "バックアップのメモ" },
      { url: fresh.link, note: "新しいメモ" },
      { url: same.link, note: "同じメモ" },
      { url: "https://example.test/missing", note: "未読込" },
    ],
  });
  expect(
    screen.getByText("新しいメモ: 1件 / 異なる既存メモ: 1件 / 同じメモ: 1件"),
  ).toBeInTheDocument();
  expect(screen.getByText("読み込み済みの記事にない URL: 1件")).toBeInTheDocument();
  const replace = screen.getByRole("checkbox", { name: "異なる既存メモも置き換える" });
  expect(replace).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "メモを復元 (1件)" }));
  expect(props.setNote).toHaveBeenCalledExactlyOnceWith("fresh", "新しいメモ");
  await selectFile("notes", { notes: [{ url: article.link, note: "バックアップのメモ" }] });
  expect(screen.getByRole("button", { name: "メモを復元 (0件)" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "異なる既存メモも置き換える" }));
  fireEvent.click(screen.getByRole("button", { name: "メモを復元 (1件)" }));
  expect(props.setNote).toHaveBeenLastCalledWith("match", "バックアップのメモ");
});

it("recomputes against current articles and registered state before apply", async () => {
  const fresh = makeArticle({ id: "fresh", link: "https://example.test/b" });
  const view = render(<ImportExportTabPanel {...props} />);
  await selectFile("article-state", {
    label: "後で読む",
    articles: [{ url: article.link }, { url: fresh.link }],
  });
  expect(screen.getByText("追加候補: 1件 / 登録済み: 0件")).toBeInTheDocument();
  view.rerender(
    <ImportExportTabPanel
      {...props}
      articles={[article, fresh]}
      readingListIds={new Set([article.id])}
    />,
  );
  expect(screen.getByText("追加候補: 1件 / 登録済み: 1件")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "後で読むに追加 (1件)" }));
  expect(props.toggleReadingList).toHaveBeenCalledExactlyOnceWith(fresh.id);
});

it("does not apply twice on repeated synchronous clicks", async () => {
  render(<ImportExportTabPanel {...props} />);
  await selectFile("article-state", { label: "ブックマーク", articles: [{ url: article.link }] });
  const apply = screen.getByRole("button", { name: "ブックマークに追加 (1件)" });
  act(() => {
    fireEvent.click(apply);
    fireEvent.click(apply);
  });
  expect(props.toggleBookmark).toHaveBeenCalledExactlyOnceWith(article.id);
});

it.each(["hide", "account", "unmount"] as const)(
  "ignores a late file read after %s",
  async (interrupt) => {
    const text = deferred<string>();
    const view = render(<ImportExportTabPanel {...props} />);
    startFile("notes", () => text.promise);
    if (interrupt === "unmount") view.unmount();
    else
      view.rerender(
        <ImportExportTabPanel
          {...props}
          hidden={interrupt === "hide"}
          userId={interrupt === "account" ? "two" : "one"}
        />,
      );
    await act(async () =>
      text.resolve(JSON.stringify({ notes: [{ url: article.link, note: "遅いメモ" }] })),
    );
    expect(screen.queryByRole("region", { name: "JSON 復元プレビュー" })).not.toBeInTheDocument();
    expect(props.setNote).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  },
);

it("uses only the latest selected file and resets the input for selecting it again", async () => {
  const first = deferred<string>();
  render(<ImportExportTabPanel {...props} />);
  const input = startFile("notes", () => first.promise);
  await selectFile("article-state", { label: "後で読む", articles: [{ url: article.link }] });
  await act(async () =>
    first.resolve(JSON.stringify({ notes: [{ url: article.link, note: "古いメモ" }] })),
  );
  expect(screen.getByRole("button", { name: "後で読むに追加 (1件)" })).toBeInTheDocument();
  expect(input.value).toBe("");
  expect(props.setNote).not.toHaveBeenCalled();
});

it("discards the preview on category/account changes and restores focus on cancellation", async () => {
  const view = render(<ImportExportTabPanel {...props} />);
  await selectFile("notes", { notes: [{ url: article.link, note: "メモ" }] });
  expect(screen.getByRole("heading", { name: "JSON 復元プレビュー" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "取込をキャンセル" }));
  expect(screen.getByRole("button", { name: "メモ JSON 取込" })).toHaveFocus();
  await selectFile("notes", { notes: [{ url: article.link, note: "メモ" }] });
  view.rerender(<ImportExportTabPanel {...props} hidden />);
  view.rerender(<ImportExportTabPanel {...props} />);
  expect(screen.queryByRole("region", { name: "JSON 復元プレビュー" })).not.toBeInTheDocument();
  await selectFile("notes", { notes: [{ url: article.link, note: "メモ" }] });
  view.rerender(<ImportExportTabPanel {...props} userId="two" />);
  expect(screen.queryByRole("region", { name: "JSON 復元プレビュー" })).not.toBeInTheDocument();
});

it.each(["not json", "[]", '{"notes":[]}', '{"notes":[{"url":"a","note":5}]}'])(
  "rejects invalid/empty notes %s without writes",
  async (text) => {
    render(<ImportExportTabPanel {...props} />);
    await act(async () => {
      startFile("notes", async () => text);
    });
    expect(toast.error).toHaveBeenCalled();
    expect(props.setNote).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "JSON 復元プレビュー" })).not.toBeInTheDocument();
  },
);

it("rejects oversized files before reading their bytes", () => {
  render(<ImportExportTabPanel {...props} />);
  const text = vi.fn(async () => "{}");
  startFile("notes", text, 5 * 1024 * 1024 + 1);
  expect(text).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("JSON ファイルのサイズが大きすぎます（上限5MB）");
});

it("requires a current collection destination and never applies to a removed target", async () => {
  const view = render(<ImportExportTabPanel {...props} />);
  await selectFile("collections", { label: "元", articles: [{ url: article.link }] });
  expect(toast.error).toHaveBeenCalledWith("取り込み先コレクションを選択してください");
  fireEvent.change(screen.getByRole("combobox", { name: "コレクション JSON の取り込み先" }), {
    target: { value: "collection" },
  });
  await selectFile("collections", { label: "元", articles: [{ url: article.link }] });
  view.rerender(<ImportExportTabPanel {...props} collections={[]} />);
  expect(screen.getByText("取り込み先: コレクションが削除されました")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "コレクションに追加 (1件)" })).toBeDisabled();
  expect(props.addArticlesToCollection).not.toHaveBeenCalled();
});

it("blocks a collection restore that cannot fit without silently dropping candidates", async () => {
  const fresh = makeArticle({ id: "fresh", link: "https://example.test/b" });
  const existing = Array.from({ length: 999 }, (_, index) => `existing-${index}`);
  render(
    <ImportExportTabPanel
      {...props}
      articles={[article, fresh]}
      collections={[{ ...props.collections[0], articleIds: existing }]}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "コレクション JSON の取り込み先" }), {
    target: { value: "collection" },
  });
  await selectFile("collections", {
    label: "元",
    articles: [{ url: article.link }, { url: fresh.link }],
  });
  expect(
    screen.getByText(
      "コレクション上限1000件: 空き1件に対して追加候補2件です。別の取り込み先を選ぶか、ファイルを分けてください",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "コレクションに追加 (2件)" })).toBeDisabled();
  expect(props.addArticlesToCollection).not.toHaveBeenCalled();
});

it("blocks notes that would exceed the entire synced note snapshot, including unloaded articles", async () => {
  const existing = Object.fromEntries(
    Array.from({ length: MAX_NOTES }, (_, index) => [`existing-${index}`, "メモ"]),
  );
  const view = render(<ImportExportTabPanel {...props} notes={existing} />);
  await selectFile("notes", { notes: [{ url: article.link, note: "新規メモ" }] });
  expect(
    screen.getByText(
      `メモ同期上限${MAX_NOTES}件: 取り込み後は${MAX_NOTES + 1}件になります。既存メモを整理してから取り込んでください`,
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "メモを復元 (1件)" })).toBeDisabled();
  expect(props.setNote).not.toHaveBeenCalled();
  view.rerender(
    <ImportExportTabPanel
      {...props}
      notes={Object.fromEntries(Object.entries(existing).slice(1))}
    />,
  );
  expect(screen.getByRole("button", { name: "メモを復元 (1件)" })).toBeEnabled();
});

it("rejects an oversized bookmark delta without applying a partial restoration", async () => {
  const many = Array.from({ length: MAX_BOOKMARK_IDS + 1 }, (_, index) =>
    makeArticle({ id: `bulk-${index}`, link: `https://example.test/${index}` }),
  );
  const view = render(<ImportExportTabPanel {...props} articles={many} />);
  await selectFile("article-state", {
    label: "ブックマーク",
    articles: many.map((entry) => ({ url: entry.link })),
  });
  expect(
    screen.getByText(
      `一度の追加上限${MAX_BOOKMARK_IDS}件を超えています。ファイルを分けて取り込んでください`,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: `ブックマークに追加 (${MAX_BOOKMARK_IDS + 1}件)` }),
  ).toBeDisabled();
  expect(props.toggleBookmark).not.toHaveBeenCalled();
  view.rerender(
    <ImportExportTabPanel {...props} articles={many} bookmarkIds={new Set([many[0].id])} />,
  );
  expect(
    screen.getByRole("button", { name: `ブックマークに追加 (${MAX_BOOKMARK_IDS}件)` }),
  ).toBeEnabled();
});

it("blocks a valid note batch whose complete synced snapshot cannot fit the existing request body", async () => {
  const many = Array.from({ length: 263 }, (_, index) =>
    makeArticle({ id: `note-${index}`, link: `https://example.test/notes/${index}` }),
  );
  render(<ImportExportTabPanel {...props} articles={many} notes={{}} />);
  await selectFile("notes", {
    notes: many.map((entry) => ({ url: entry.link, note: "a".repeat(MAX_NOTE_LENGTH) })),
  });
  expect(screen.getByRole("alert")).toHaveTextContent("同期データの上限（512K文字）を超えています");
  expect(screen.getByRole("button", { name: "メモを復元 (263件)" })).toBeDisabled();
  expect(props.setNote).not.toHaveBeenCalled();
});

it("retains the collection preview after failure and retries from current membership", async () => {
  const add = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const view = render(<ImportExportTabPanel {...props} addArticlesToCollection={add} />);
  fireEvent.change(screen.getByRole("combobox", { name: "コレクション JSON の取り込み先" }), {
    target: { value: "collection" },
  });
  await selectFile("collections", { label: "元", articles: [{ url: article.link }] });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "コレクションに追加 (1件)" })),
  );
  expect(screen.getByRole("region", { name: "JSON 復元プレビュー" })).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalled();
  view.rerender(
    <ImportExportTabPanel
      {...props}
      addArticlesToCollection={add}
      collections={[{ ...props.collections[0], articleIds: [article.id] }]}
    />,
  );
  expect(screen.getByRole("button", { name: "コレクションに追加 (0件)" })).toBeDisabled();
  expect(add).toHaveBeenCalledTimes(1);
});
