// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DocswellViewer from "./DocswellViewer";
import { getPopupOpenCount } from "../../lib/popup-lock";

afterEach(cleanup);
const url = "https://www.docswell.com/s/3402128/KVJYJ3-title?__readwiseLocation=#p1";

describe("DocswellViewer", () => {
  it("mounts one bounded lazy player and a safe external fallback", () => {
    render(<DocswellViewer url={url} title="Test deck" />);
    const frame = screen.getByTitle("Test deck — Docswell スライド");
    expect(frame).toHaveAttribute("src", "https://www.docswell.com/slide/KVJYJ3/embed");
    expect(frame).toHaveAttribute("loading", "lazy");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
    expect(screen.getByRole("link", { name: /Docswell で開く/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("expands, handles native cancellation, and restores focus without mounting two players", () => {
    render(<DocswellViewer url={url} title="Test deck" />);
    const trigger = screen.getByRole("button", { name: "スライドを拡大" });
    const originalFrame = document.querySelector("iframe");
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Test deck" })).toBeInTheDocument();
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(document.querySelector("iframe")).toBe(originalFrame);
    expect(getPopupOpenCount()).toBe(1);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(getPopupOpenCount()).toBe(0);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(document.querySelector("iframe")).toBe(originalFrame);
  });

  it("drops the old expanded player when navigating to another deck or an ordinary article", () => {
    const { rerender } = render(<DocswellViewer url={url} title="Test deck" />);
    fireEvent.click(screen.getByRole("button", { name: "スライドを拡大" }));
    rerender(
      <DocswellViewer url="https://www.docswell.com/s/test/ABC123-other" title="Next deck" />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTitle("Next deck — Docswell スライド")).toHaveAttribute(
      "src",
      "https://www.docswell.com/slide/ABC123/embed",
    );
    expect(getPopupOpenCount()).toBe(0);
    rerender(<DocswellViewer url="https://evil.test/slide/ABC123/embed" title="Invalid" />);
    expect(document.querySelector("iframe")).toBeNull();
  });
});
