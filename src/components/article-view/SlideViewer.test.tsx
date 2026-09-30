// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SlideViewer from "./SlideViewer";
import { getPopupOpenCount } from "../../lib/popup-lock";
import SlideViewerKeyboardHarness from "../../../e2e/helpers/slide-viewer-keyboard";

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

describe("expanded slide keyboard boundary", () => {
  it.each(["j", "k", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "n", "p"])(
    "keeps %s on the focused Close button from selecting or reading a background article",
    (key) => {
      render(<SlideViewerKeyboardHarness />);
      fireEvent.click(screen.getByRole("button", { name: "スライドを拡大" }));
      const close = screen.getByRole("button", { name: "閉じる" });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key });
      expect(screen.getByTestId("selected")).toHaveTextContent("Current");
      expect(screen.getByTestId("read")).toBeEmptyDOMElement();
      expect(screen.getByRole("dialog", { name: "Deck" })).toBeInTheDocument();
    },
  );

  it("isolates source-link keys, repeated input, and other background actions", () => {
    render(<SlideViewerKeyboardHarness />);
    fireEvent.click(screen.getByRole("button", { name: "スライドを拡大" }));
    const link = screen.getByRole("link", { name: "Speaker Deck で開く ↗" });
    link.focus();
    for (const key of ["j", "j", "b", "r", "m", "h", "?", ","]) {
      fireEvent.keyDown(link, { key, repeat: true });
    }
    expect(screen.getByTestId("selected")).toHaveTextContent("Current");
    expect(screen.getByTestId("read")).toBeEmptyDOMElement();
    expect(screen.getByTestId("actions")).toHaveTextContent("0");
    expect(screen.getByTestId("help")).toHaveTextContent("false");
    expect(screen.getByTestId("settings")).toHaveTextContent("false");
  });

  it.each(["Tab", "Escape", "Enter", " ", "ArrowRight"])(
    "does not cancel the native %s default action",
    (key) => {
      render(<SlideViewerKeyboardHarness />);
      fireEvent.click(screen.getByRole("button", { name: "スライドを拡大" }));
      const event = createEvent.keyDown(screen.getByRole("button", { name: "閉じる" }), {
        key,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(screen.getByRole("button", { name: "閉じる" }), event);
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it("restores normal shortcuts after Close and a repeated expand/cancel cycle", () => {
    render(<SlideViewerKeyboardHarness />);
    const trigger = screen.getByRole("button", { name: "スライドを拡大" });
    const frame = screen.getByTitle("Deck — Speaker Deck スライド");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent(
      screen.getByRole("dialog", { name: "Deck" }),
      new Event("cancel", { cancelable: true }),
    );
    expect(trigger).toHaveFocus();
    expect(getPopupOpenCount()).toBe(0);
    expect(screen.getByTitle("Deck — Speaker Deck スライド")).toBe(frame);
    fireEvent.keyDown(trigger, { key: "j" });
    expect(screen.getByTestId("selected")).toHaveTextContent("Next");
    expect(screen.getByTestId("read")).toHaveTextContent("Next");
    fireEvent.keyDown(screen.getByRole("link"), { key: "k" });
    expect(screen.getByTestId("selected")).toHaveTextContent("Current");
    expect(screen.getByTestId("read")).toHaveTextContent("Next,Current");
  });
});
