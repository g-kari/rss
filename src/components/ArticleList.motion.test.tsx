import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ArticleList from "./ArticleList";
import { useFilteredArticles } from "../hooks/useFilteredArticles";
import { ArticleFilterProvider } from "../contexts/ArticleFilterContext";
import { ReaderSettingsProvider, type ReaderSettings } from "../contexts/ReaderSettingsContext";
import { ToastProvider } from "../contexts/ToastContext";
import type { Article, Layout } from "../types";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";

const mocks = vi.hoisted(() => ({
  presented: [] as Article[],
  arrival: vi.fn(),
  media: new Map<string, { images: string[]; embeds: string[] }>(),
}));
vi.mock("../hooks/useReaderArrival", () => ({ useReaderArrival: mocks.arrival }));
vi.mock("../hooks/useDelayedGalleryItems", () => ({
  useDelayedGalleryItems: () => ({
    displayItems: mocks.presented,
    deletingIds: new Set<string>(),
    newIds: new Set<string>(),
  }),
}));
vi.mock("../contexts/VisualModeContext", () => ({
  useVisualMode: () => ({ motionAllowed: true, pageVisible: true }),
}));
vi.mock("../hooks/usePrefetchGalleryContents", () => ({
  usePrefetchGalleryContents: () => ({
    media: mocks.media,
    failedIds: new Set<string>(),
    expandingIds: new Set<string>(),
    retryArticle: () => {},
    rateLimitedUntil: 0,
  }),
}));
const empty = new Set<string>();
const noop = () => {};
const feeds = [makeFeed({ id: "a" }), makeFeed({ id: "b" })];
const articles = [
  makeArticle({ id: "a-one", feedHash: "a", link: "https://example.com/a-one" }),
  makeArticle({ id: "a-two", feedHash: "a", link: "https://example.com/a-two" }),
  makeArticle({ id: "b-one", feedHash: "b", link: "https://example.com/b-one" }),
];
const settings = {
  galleryColumns: 3,
  galleryColumnsFocus: "auto",
  galleryCardSize: "medium",
  galleryMinImagePx: 0,
  autoReadEnabled: false,
  galleryAutoScrollSpeed: "off",
  onChangeGalleryAutoScrollSpeed: noop,
} as unknown as ReaderSettings;
function Reader({
  feed = "b",
  layout = "card",
  tick = 0,
  pictures = false,
}: {
  feed?: string;
  layout?: Layout;
  tick?: number;
  pictures?: boolean;
}) {
  const filter = useFilteredArticles({
    articles,
    feeds,
    feedId: feed,
    readIds: empty,
    bookmarkIds: empty,
    readingListIds: empty,
    globalFilter: null,
    setGlobalFilter: noop,
    selectedArticleId: null,
  });
  return (
    <ToastProvider
      value={{ info: noop, success: noop, error: noop, undo: noop, dismiss: noop, toasts: [] }}
    >
      <ReaderSettingsProvider value={settings}>
        <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
          <ArticleList
            feeds={feeds}
            readIds={empty}
            bookmarkIds={empty}
            readingListIds={empty}
            selectedArticleId={null}
            selectedFeedId={feed}
            anchorTrigger={tick}
            activeFeedView={pictures ? "pictures" : undefined}
            layout={layout}
            onChangeLayout={noop}
            onSelectArticle={noop}
            onToggleRead={noop}
            onToggleBookmark={noop}
            onMarkRead={noop}
            listFocusMode={false}
            onToggleListFocusMode={noop}
          />
        </ArticleFilterProvider>
      </ReaderSettingsProvider>
    </ToastProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  mocks.arrival.mockClear();
  mocks.media = new Map();
});
afterEach(cleanup);

it.each(["card", "gallery"] as const)("waits for presented scope IDs in %s", (layout) => {
  mocks.presented = [articles[0], articles[1]];
  const { rerender } = render(<Reader layout={layout} />);
  expect(mocks.arrival.mock.calls.at(-1)?.[3]).toEqual([]);
  mocks.presented = [articles[2]];
  // The mock's presentation commit must rerender the memoized list, like its real state update.
  rerender(<Reader layout={layout} tick={1} />);
  expect(mocks.arrival.mock.calls.at(-1)?.[3]).toEqual(["b-one"]);
});
it("does not announce appended IDs before they reach the presentation", () => {
  mocks.presented = [articles[0]];
  const { rerender } = render(<Reader feed="a" />);
  expect(mocks.arrival.mock.calls.at(-1)?.[3]).toEqual(["a-one"]);
  mocks.presented = [articles[0], articles[1]];
  rerender(<Reader feed="a" tick={1} />);
  expect(mocks.arrival.mock.calls.at(-1)?.[3]).toEqual(["a-one", "a-two"]);
});
it("excludes stale delayed-removal rows from the current motion scope", () => {
  mocks.presented = articles;
  render(<Reader feed="b" />);
  expect(mocks.arrival.mock.calls.at(-1)?.[3]).toEqual(["b-one"]);
});
it("deduplicates the actual exploded gallery presentation into article IDs", () => {
  mocks.presented = [articles[2]];
  mocks.media = new Map([
    [
      "b-one",
      { images: ["https://example.com/one.jpg", "https://example.com/two.jpg"], embeds: [] },
    ],
  ]);
  render(<Reader layout="gallery" pictures />);
  expect(mocks.arrival.mock.calls.at(-1)?.[3]).toEqual(["b-one"]);
});
