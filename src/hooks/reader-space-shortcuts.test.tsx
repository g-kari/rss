import { useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeKeyboardNavFixture } from "../../e2e/helpers/keyboard-nav-fixture";
import { useKeyboardNav } from "./useKeyboardNav";
import { registerReaderFocusOverlay, useArticleViewShortcuts } from "./useArticleViewShortcuts";

afterEach(cleanup);

function Fixture({
  scroll,
}: {
  scroll: ReturnType<typeof vi.fn<(options?: ScrollToOptions) => void>>;
}) {
  const options = makeKeyboardNavFixture();
  const mainRef = useRef<HTMLElement>(null);
  useKeyboardNav(options);
  useArticleViewShortcuts({
    article: options.selectedArticle,
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
    autoAiBrowserOnly: true,
    aiPreferenceKey: "test",
    translatorAvailable: false,
    summarizerAvailable: false,
    translateResult: null,
    translateLoading: false,
  });
  return (
    <>
      <button>
        <span>Native action</span>
      </button>
      <details>
        <summary>Native disclosure</summary>
        <p>Details</p>
      </details>
      <div role="button" tabIndex={0} onKeyDown={(event) => event.preventDefault()}>
        Custom action
      </div>
      <main
        aria-label="記事本文"
        ref={(element) => {
          mainRef.current = element;
          if (element) {
            element.scrollBy = (optionsOrX?: ScrollToOptions | number) =>
              scroll(typeof optionsOrX === "number" ? { left: optionsOrX } : optionsOrX);
            Object.defineProperty(element, "clientHeight", { value: 500 });
          }
        }}
      />
    </>
  );
}

function press(target: EventTarget, shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    key: " ",
    bubbles: true,
    cancelable: true,
    shiftKey,
  });
  act(() => target.dispatchEvent(event));
  return event;
}

describe("the actual global and article reader Space listeners together", () => {
  it.each(["button", "summary"])("leaves native %s activation to the browser", (tag) => {
    const scroll = vi.fn();
    render(<Fixture scroll={scroll} />);
    const target = document.querySelector<HTMLElement>(tag)!;
    target.focus();
    const event = press(target);
    expect(event.defaultPrevented).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("also protects a descendant target and an already handled custom button", () => {
    const scroll = vi.fn();
    render(<Fixture scroll={scroll} />);
    expect(press(screen.getByText("Native action")).defaultPrevented).toBe(false);
    expect(press(screen.getByRole("button", { name: "Custom action" })).defaultPrevented).toBe(
      true,
    );
    expect(scroll).not.toHaveBeenCalled();
  });

  it("lets the registered focus reader, rather than global navigation, own body Space", () => {
    const scroll = vi.fn();
    render(<Fixture scroll={scroll} />);
    const unregister = registerReaderFocusOverlay(document.querySelector("main")!);
    try {
      expect(press(document.body).defaultPrevented).toBe(true);
      expect(scroll).toHaveBeenCalledOnce();
      expect(scroll.mock.calls[0][0]?.top).toBe(400);
    } finally {
      unregister();
    }
  });

  it.each([false, true])("scrolls the article once from the body (shift=%s)", (shift) => {
    const scroll = vi.fn();
    render(<Fixture scroll={scroll} />);
    expect(press(document.body, shift).defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.calls[0][0].top).toBe(shift ? -450 : 450);
  });
});
