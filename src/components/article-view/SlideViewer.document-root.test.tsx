// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import SlideViewerKeyboardHarness from "../../../e2e/helpers/slide-viewer-keyboard";
import { getPopupOpenCount } from "../../lib/popup-lock";

let root: Root | null;
let testWindow: Window;
let earlyDocumentListener: Mock<() => void>;

beforeEach(async () => {
  testWindow = new Window({ settings: { disableIframePageLoading: true } });
  vi.stubGlobal("window", testWindow);
  vi.stubGlobal("document", testWindow.document);
  vi.stubGlobal("KeyboardEvent", testWindow.KeyboardEvent);
  vi.stubGlobal("Event", testWindow.Event);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  earlyDocumentListener = vi.fn();
  document.addEventListener("keydown", earlyDocumentListener);
  // Next App Router hydrates the document itself, so React and native shortcuts
  // receive bubbling keydown events on the same node, not a descendant div.
  const documentRoot = createRoot(document);
  root = documentRoot;
  await act(async () => {
    documentRoot.render(
      <html>
        <head />
        <body>
          <SlideViewerKeyboardHarness />
        </body>
      </html>,
    );
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  document.removeEventListener("keydown", earlyDocumentListener);
  await testWindow.happyDOM.close();
  vi.unstubAllGlobals();
});

describe("slide keyboard isolation with a document React root", () => {
  it.each(["j", "ArrowDown", "PageDown", "k", "ArrowUp", "PageUp", "b", "r", "?"])(
    "does not run the same-document native %s shortcut while expanded",
    async (key) => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
      await act(async () => trigger.click());
      const close = document.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]')!;
      expect(document.activeElement).toBe(close);
      await act(async () => {
        close.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
      expect(document.querySelector('[data-testid="selected"]')?.textContent).toBe("Current");
      expect(document.querySelector('[data-testid="read"]')?.textContent).toBe("");
      expect(document.querySelector('[data-testid="actions"]')?.textContent).toBe("0");
      expect(document.querySelector('[data-testid="help"]')?.textContent).toBe("false");
      expect(earlyDocumentListener).not.toHaveBeenCalled();
    },
  );

  it.each(["Tab", "Escape", "Enter", " ", "ArrowRight"])(
    "leaves the native %s default action uncancelled at a document root",
    async (key) => {
      await act(async () => {
        document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click();
      });
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      document.querySelector('button[aria-label="閉じる"]')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(earlyDocumentListener).not.toHaveBeenCalled();
    },
  );

  it("removes the boundary on close and restores it on repeated expansion and cancel", async () => {
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    const dialog = document.querySelector("dialog")!;
    const link = dialog.querySelector("a")!;
    const frame = dialog.querySelector("iframe");
    const add = vi.spyOn(dialog, "addEventListener");
    const remove = vi.spyOn(dialog, "removeEventListener");
    await act(async () => trigger.click());
    const firstListener = add.mock.calls.find(([event]) => event === "keydown")![1];
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]')!.click();
    });
    expect(remove).toHaveBeenCalledWith("keydown", firstListener);
    expect(getPopupOpenCount()).toBe(0);
    expect(document.activeElement).toBe(trigger);
    await act(async () => {
      link.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    });
    expect(document.querySelector('[data-testid="selected"]')?.textContent).toBe("Next");
    expect(document.querySelector('[data-testid="read"]')?.textContent).toBe("Next");
    expect(earlyDocumentListener).toHaveBeenCalledTimes(1);
    earlyDocumentListener.mockClear();
    await act(async () => trigger.click());
    const listeners = add.mock.calls.filter(([event]) => event === "keydown");
    expect(listeners).toHaveLength(2);
    await act(async () => {
      link.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    });
    expect(document.querySelector('[data-testid="selected"]')?.textContent).toBe("Next");
    expect(earlyDocumentListener).not.toHaveBeenCalled();
    await act(async () => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(remove).toHaveBeenCalledWith("keydown", listeners[1]![1]);
    expect(getPopupOpenCount()).toBe(0);
    expect(document.activeElement).toBe(trigger);
    expect(dialog.querySelector("iframe")).toBe(frame);
    await act(async () => {
      link.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    });
    expect(document.querySelector('[data-testid="selected"]')?.textContent).toBe("Current");
    expect(earlyDocumentListener).toHaveBeenCalledTimes(1);
  });

  it("removes the native boundary when an expanded viewer unmounts", async () => {
    const dialog = document.querySelector("dialog")!;
    const add = vi.spyOn(dialog, "addEventListener");
    const remove = vi.spyOn(dialog, "removeEventListener");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click();
    });
    const listener = add.mock.calls.find(([event]) => event === "keydown")![1];
    await act(async () => root?.unmount());
    root = null;
    expect(remove).toHaveBeenCalledWith("keydown", listener);
    expect(getPopupOpenCount()).toBe(0);
    // Even the retained, detached dialog no longer swallows bubbling keys.
    const host = document.createElement("div");
    const bubbled = vi.fn();
    host.addEventListener("keydown", bubbled);
    host.appendChild(dialog);
    dialog
      .querySelector("a")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(bubbled).toHaveBeenCalledTimes(1);
  });
});
