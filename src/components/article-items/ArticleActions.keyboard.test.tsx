import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../../e2e/helpers/article";
import { SelectedArticleCtx } from "../../contexts/SelectedArticleContext";
import {
  CompactArticleItem,
  ListArticleItem,
  CardArticleItem,
  MagazineFeaturedArticleItem,
  GalleryArticleItem,
} from "./index";

afterEach(cleanup);
const article = makeArticle({ id: "keyboard", title: "Keyboard article" });
const layouts = [
  ["compact", CompactArticleItem],
  ["list", ListArticleItem],
  ["card", CardArticleItem],
  ["magazine", MagazineFeaturedArticleItem],
  ["gallery", GalleryArticleItem],
] as const;

for (const [name, Item] of layouts) {
  describe(name, () => {
    function setup() {
      const select = vi.fn();
      const read = vi.fn();
      const bookmark = vi.fn();
      const readingList = vi.fn();
      render(
        <SelectedArticleCtx.Provider value={article.id}>
          <Item
            article={article}
            index={0}
            isRead={false}
            isBookmarked={false}
            hasNote
            feedName="Synthetic feed"
            showFeedName
            query=""
            thumb={undefined}
            onSelectArticle={select}
            onToggleRead={read}
            onToggleBookmark={bookmark}
            onToggleReadingList={readingList}
          />
        </SelectedArticleCtx.Provider>,
      );
      return { select, read, bookmark, readingList };
    }

    for (const key of ["Enter", " "]) {
      it(`preserves native ${key} on nested actions without selecting the article`, () => {
        const { select } = setup();
        for (const button of screen.getAllByRole("button")) {
          expect(fireEvent.keyDown(button, { key })).toBe(true);
          expect(select).not.toHaveBeenCalled();
        }
      });
      it(`retains ${key} selection on the article itself`, () => {
        const { select } = setup();
        expect(fireEvent.keyDown(screen.getByRole("article"), { key })).toBe(false);
        expect(select).toHaveBeenCalledTimes(1);
        expect(select.mock.calls[0][0]).toBe(article);
      });
    }
    it("keeps actions isolated and exposes them when keyboard focus enters the article", () => {
      const { select, read, bookmark } = setup();
      const button = screen.getByRole("button", { name: "既読にする" });
      const wrapper = button.parentElement!;
      expect(wrapper.className).toContain("group-focus-within:opacity-100");
      expect(wrapper.className).toContain("group-focus-within:pointer-events-auto");
      fireEvent.click(button);
      fireEvent.click(screen.getByRole("button", { name: "ブックマーク" }));
      expect(read).toHaveBeenCalledExactlyOnceWith(article.id);
      expect(bookmark).toHaveBeenCalledExactlyOnceWith(article.id);
      expect(select).not.toHaveBeenCalled();
    });
  });
}
