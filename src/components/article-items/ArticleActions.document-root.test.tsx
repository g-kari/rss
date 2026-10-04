import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeArticle } from "../../../e2e/helpers/article";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import { useArticleViewShortcuts } from "../../hooks/useArticleViewShortcuts";
import {
  CompactArticleItem,
  ListArticleItem,
  CardArticleItem,
  MagazineFeaturedArticleItem,
  GalleryArticleItem,
} from "./index";

const article = makeArticle({ id: "document-keyboard", title: "Document keyboard" });
const layouts = [
  CompactArticleItem,
  ListArticleItem,
  CardArticleItem,
  MagazineFeaturedArticleItem,
  GalleryArticleItem,
];
let root: Root | undefined;
let testWindow: Window;
const early = vi.fn();
const select = vi.fn();
const scroll = vi.fn();

function Reader() {
  const mainRef = useRef<HTMLDivElement>(null);
  useArticleViewShortcuts({
    article,
    storedContent: null,
    fetching: false,
    canFetchManually: false,
    fetchFullContent: vi.fn(),
    aiResult: null,
    aiLoading: false,
    doRunAi: vi.fn(),
    resetAi: vi.fn(),
    handleTranslate: vi.fn(),
    mainRef,
    autoTranslate: false,
    autoSummarize: false,
    autoAiBrowserOnly: false,
    aiPreferenceKey: "synthetic",
    translatorAvailable: null,
    summarizerAvailable: null,
    translateResult: null,
    translateLoading: false,
  });
  return (
    <div ref={mainRef} data-testid="reader">
      Connected reader
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  testWindow = new Window();
  vi.stubGlobal("window", testWindow);
  vi.stubGlobal("document", testWindow.document);
  vi.stubGlobal("KeyboardEvent", testWindow.KeyboardEvent);
  vi.stubGlobal("HTMLButtonElement", testWindow.HTMLButtonElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Next delegates React events at document. This listener precedes React.
  document.addEventListener("keydown", early);
  root = createRoot(document);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.removeEventListener("keydown", early);
  await testWindow.happyDOM.close();
  vi.unstubAllGlobals();
});

for (const [index, Item] of layouts.entries()) {
  it(`layout ${index}: native action keys stay inside the control before document delegation`, async () => {
    await act(async () =>
      root!.render(
        <html>
          <head />
          <body>
            <SelectedArticleCtx.Provider value={article.id}>
              <Item
                article={article}
                index={0}
                isRead={false}
                isBookmarked={false}
                hasNote={false}
                feedName="Synthetic"
                showFeedName
                query=""
                thumb={undefined}
                onSelectArticle={select}
                onToggleRead={vi.fn()}
                onToggleBookmark={vi.fn()}
                onToggleReadingList={vi.fn()}
                {...(index === 4 ? { onRetry: vi.fn(), isFetchFailed: true } : {})}
              />
            </SelectedArticleCtx.Provider>
            <Reader />
          </body>
        </html>,
      ),
    );
    document.querySelector<HTMLElement>('[data-testid="reader"]')!.scrollBy = scroll;
    for (const button of document.querySelectorAll("button")) {
      for (const key of [" ", "Enter"]) {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        await act(async () => button.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(select).not.toHaveBeenCalled();
        expect(scroll).not.toHaveBeenCalled();
        expect(early).not.toHaveBeenCalled();
      }
    }
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
    );
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(1);
  });
}
