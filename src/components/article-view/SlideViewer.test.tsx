// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SlideViewer from "./SlideViewer";
import { getPopupOpenCount } from "../../lib/popup-lock";

afterEach(cleanup);
const cases = [
  [
    "Speaker Deck",
    "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3",
    "https://speakerdeck.com/jnunemaker/atom",
  ],
  [
    "SlideShare",
    "https://www.slideshare.net/slideshow/embed_code/key/lNgbnj7xXLMj97",
    "https://www.slideshare.net/slideshow/my-talk/152193732",
  ],
  [
    "Google Slides",
    "https://docs.google.com/presentation/d/e/2PACX-1vPublicPublishedExample123/pub",
    "https://docs.google.com/presentation/d/e/2PACX-1vPublicPublishedExample123/pub?start=false&loop=false&delayms=3000",
  ],
];

describe("shared slide viewer", () => {
  it.each(cases)(
    "preserves the same %s player across expansion and keeps the source link",
    (label, url, sourceUrl) => {
      const { unmount } = render(<SlideViewer url={url} sourceUrl={sourceUrl} title="Deck" />);
      const frame = screen.getByTitle(`Deck — ${label} スライド`);
      expect(screen.getByRole("link", { name: `${label} で開く ↗` })).toHaveAttribute(
        "href",
        sourceUrl,
      );
      fireEvent.click(screen.getByRole("button", { name: "スライドを拡大" }));
      expect(screen.getByRole("dialog", { name: "Deck" })).toBeInTheDocument();
      expect(document.querySelector("iframe")).toBe(frame);
      expect(getPopupOpenCount()).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
      expect(document.querySelector("iframe")).toBe(frame);
      expect(getPopupOpenCount()).toBe(0);
      unmount();
      expect(document.querySelector("iframe")).toBeNull();
    },
  );
  it("rejects private Google IDs and untrusted source fallbacks", () => {
    const { rerender } = render(
      <SlideViewer url="https://docs.google.com/presentation/d/private/edit" title="Private" />,
    );
    expect(document.querySelector("iframe")).toBeNull();
    rerender(<SlideViewer url={cases[0][1]} sourceUrl="https://evil.test/" title="Deck" />);
    expect(screen.getByRole("link", { name: "Speaker Deck で開く ↗" })).toHaveAttribute(
      "href",
      cases[0][1],
    );
  });
});
