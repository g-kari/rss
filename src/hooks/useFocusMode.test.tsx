import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FocusModeOverlay from "../components/FocusModeOverlay";
import { hasFocusHistoryOwner, useFocusMode } from "./useFocusMode";
import { useMobilePane, type MobilePane } from "./useMobilePane";

// Keep the production overlay, popup lock and focus trap. Article/provider rendering
// is unrelated to history ownership and is covered by its existing component tests.
vi.mock("../components/ArticleView", async () => {
  const { useState } = await import("react");
  const { default: ImageGallery } = await import("../components/article-view/ImageGallery");
  const { default: ImageDownloadModal } =
    await import("../components/article-view/ImageDownloadModal");
  return {
    default: function ArticleFixture() {
      const [downloadOpen, setDownloadOpen] = useState(false);
      return (
        <article>
          Article body
          <ImageGallery images={["data:image/png;base64,iVBORw0KGgo="]} />
          <button onClick={() => setDownloadOpen(true)}>Open download dialog</button>
          {downloadOpen && (
            <ImageDownloadModal
              isAlreadyDownloaded={false}
              onConfirm={() => {}}
              onCancel={() => setDownloadOpen(false)}
            />
          )}
        </article>
      );
    },
  };
});
vi.mock("../components/VisualModeBar", () => ({ VisualModeSwitch: () => null }));

interface HistoryEntry {
  mobilePane?: MobilePane;
  mobilePaneNavigationIndex?: number;
  focus?: boolean;
  router?: string;
}
let documentRoot: Root | null = null;
let ownedWindow: Window | null = null;
let entries: HistoryEntry[];
let index: number;
let pendingBack: number;
let back: ReturnType<typeof vi.spyOn>;
let push: ReturnType<typeof vi.spyOn>;
let replace: ReturnType<typeof vi.spyOn>;

beforeEach(({ task }) => {
  if (task.name.includes("document root: true")) {
    // A fresh document avoids stale React delegation from earlier RTL roots.
    ownedWindow = new Window();
    vi.stubGlobal("window", ownedWindow);
    vi.stubGlobal("document", ownedWindow.document);
    vi.stubGlobal("Event", ownedWindow.Event);
    vi.stubGlobal("KeyboardEvent", ownedWindow.KeyboardEvent);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  }
  entries = [{ router: "kept" }];
  index = 0;
  pendingBack = 0;
  vi.spyOn(window.history, "state", "get").mockImplementation(() => entries[index]);
  replace = vi.spyOn(window.history, "replaceState").mockImplementation((data: HistoryEntry) => {
    entries[index] = structuredClone(data);
  });
  push = vi.spyOn(window.history, "pushState").mockImplementation((data: HistoryEntry) => {
    entries.splice(index + 1);
    entries.push(structuredClone(data));
    index += 1;
  });
  // Browsers deliver history traversal asynchronously. A close must not depend
  // on happy-dom implementing browser history or on immediate popstate delivery.
  back = vi.spyOn(window.history, "back").mockImplementation(() => {
    pendingBack += 1;
  });
});
afterEach(async () => {
  if (documentRoot) {
    act(() => documentRoot!.unmount());
    documentRoot = null;
  }
  cleanup();
  vi.restoreAllMocks();
  if (ownedWindow) {
    await ownedWindow.happyDOM.close();
    ownedWindow = null;
    vi.unstubAllGlobals();
  }
});

function finishBack() {
  expect(pendingBack).toBe(1);
  pendingBack = 0;
  browserBack();
}
function browserBack() {
  expect(index).toBeGreaterThan(0);
  index -= 1;
  act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: entries[index] })));
}
function browserForward() {
  expect(index).toBeLessThan(entries.length - 1);
  index += 1;
  act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: entries[index] })));
}
function expectClosed(result: { current: ReturnType<typeof useFocusMode> }) {
  expect(result.current.focusMode).toBe(false);
  expect(result.current.listFocusMode).toBe(false);
}

const articleViewProps: ComponentProps<typeof FocusModeOverlay>["articleViewProps"] = {
  article: null,
  isBookmarked: false,
  onToggleBookmark: () => {},
  isInReadingList: false,
  onToggleReadingList: () => {},
  isLiked: false,
  onToggleLike: () => {},
};
function ReaderFixture({ initial = "view" }: { initial?: MobilePane }) {
  // Same hook order as AppShell: mobile listener is registered before focus.
  const pane = useMobilePane(initial);
  const focus = useFocusMode();
  return (
    <>
      <div data-testid="base-reader">
        <button onClick={focus.toggleFocusMode}>Open reader focus</button>
        <button onClick={() => pane.setMobilePane("list")}>Open list</button>
        <button onClick={() => pane.setMobilePane("view")}>Open article</button>
        <output>{pane.mobilePane}</output>
      </div>
      <FocusModeOverlay
        focusMode={focus.focusMode}
        exitFocusMode={focus.exitFocusMode}
        articleViewProps={articleViewProps}
      />
    </>
  );
}

describe("reader focus return", () => {
  it.each(["reader", "list"] as const)(
    "closes %s focus on the first exit and consumes one entry",
    (mode) => {
      const { result } = renderHook(useFocusMode);
      act(() =>
        mode === "reader" ? result.current.toggleFocusMode() : result.current.toggleListFocusMode(),
      );
      act(() => result.current.exitFocusMode());
      expect(mode === "reader" ? result.current.focusMode : result.current.listFocusMode).toBe(
        true,
      );
      act(() => {
        result.current.exitFocusMode();
        result.current.exitFocusMode();
      });
      expect(back).toHaveBeenCalledTimes(1);
      finishBack();
      expectClosed(result);
      expect(index).toBe(0);
    },
  );

  it.each(["reader", "list"] as const)("closes %s using its same-mode toggle", (mode) => {
    const { result } = renderHook(useFocusMode);
    const toggle =
      mode === "reader" ? result.current.toggleFocusMode : result.current.toggleListFocusMode;
    act(toggle);
    act(toggle);
    finishBack();
    expectClosed(result);
  });

  it("keeps modes exclusive without adding history when switching", () => {
    const { result } = renderHook(useFocusMode);
    act(() => result.current.toggleFocusMode());
    act(() => result.current.toggleListFocusMode());
    expect(result.current.focusMode).toBe(false);
    expect(result.current.listFocusMode).toBe(true);
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(true);
    expect(result.current.listFocusMode).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    browserBack();
    expectClosed(result);
    expect(back).not.toHaveBeenCalled();
  });

  it("waits for exit traversal before allowing a new focus entry", () => {
    const { result } = renderHook(useFocusMode);
    act(() => result.current.toggleFocusMode());
    act(() => result.current.exitFocusMode());
    act(() => {
      result.current.toggleFocusMode();
      result.current.toggleListFocusMode();
    });
    expect(result.current.focusMode).toBe(true);
    expect(result.current.listFocusMode).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    finishBack();
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(true);
    expect(push).toHaveBeenCalledTimes(2);
    browserBack();
    expectClosed(result);
  });

  it("preserves existing history metadata on entering focus", () => {
    const { result } = renderHook(useFocusMode);
    act(() => result.current.toggleFocusMode());
    expect(window.history.state).toEqual({ router: "kept", focus: true });
    browserBack();
    expectClosed(result);
    expect(window.history.state).toEqual({ router: "kept" });
  });

  it.each(["\\", "\\ with Shift"])("opens and closes using %s", (key) => {
    const { result } = renderHook(useFocusMode);
    const shiftKey = key.includes("Shift");
    fireEvent.keyDown(document, { key: "\\", shiftKey });
    expect(shiftKey ? result.current.listFocusMode : result.current.focusMode).toBe(true);
    fireEvent.keyDown(document, { key: "\\", shiftKey });
    finishBack();
    expectClosed(result);
  });

  it("reopens safely after Forward onto a departed focus entry", () => {
    const { result } = renderHook(useFocusMode);
    act(() => result.current.toggleFocusMode());
    browserBack();
    browserForward();
    expectClosed(result);
    act(() => result.current.toggleFocusMode());
    act(() => result.current.exitFocusMode());
    finishBack();
    expectClosed(result);
    act(() => result.current.toggleListFocusMode());
    expect(result.current.listFocusMode).toBe(true);
  });

  it("reopens safely from a reloaded focus history marker", () => {
    entries[0] = { router: "kept", focus: true };
    const { result } = renderHook(useFocusMode);
    act(() => result.current.toggleFocusMode());
    act(() => result.current.exitFocusMode());
    finishBack();
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(true);
    expect(entries[0]).toEqual({ router: "kept", focus: false });
  });

  it("does not strand closing if another history write races the requested Back", () => {
    const { result } = renderHook(useFocusMode);
    act(() => result.current.toggleFocusMode());
    act(() => result.current.exitFocusMode());
    window.history.pushState({ mobilePane: "view" }, "");
    finishBack();
    expectClosed(result);
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(true);
    act(() => result.current.exitFocusMode());
    finishBack();
    expectClosed(result);
  });

  it("keeps editable and unrelated keys from exiting focus", () => {
    const { result } = renderHook(useFocusMode);
    act(() => result.current.toggleListFocusMode());
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(document, { key: "j" });
    expect(result.current.listFocusMode).toBe(true);
    expect(back).not.toHaveBeenCalled();
    input.remove();
    fireEvent.keyDown(document, { key: "Escape" });
    finishBack();
    expectClosed(result);
  });

  it.each(["view", "list"] as const)(
    "returns a directly opened %s pane after browser Back",
    (initial) => {
      render(<ReaderFixture initial={initial} />);
      fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
      expect(screen.getByRole("dialog", { name: "フォーカスモード" })).toBeInTheDocument();
      browserBack();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(initial);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(entries[0]).toEqual({
        router: "kept",
        mobilePane: initial,
        mobilePaneNavigationIndex: 0,
      });
    },
  );

  it("returns to the current mobile article, then navigates view -> list -> sidebar normally", () => {
    render(<ReaderFixture initial="sidebar" />);
    fireEvent.click(screen.getByRole("button", { name: "Open list" }));
    fireEvent.click(screen.getByRole("button", { name: "Open article" }));
    fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
    fireEvent.click(screen.getByRole("button", { name: "フォーカスモード終了" }));
    expect(screen.getByRole("dialog", { name: "フォーカスモード" })).toBeInTheDocument();
    finishBack();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("view");
    browserBack();
    expect(screen.getByRole("status")).toHaveTextContent("list");
    browserBack();
    expect(screen.getByRole("status")).toHaveTextContent("sidebar");
    const pushes = push.mock.calls.length;
    browserForward();
    expect(screen.getByRole("status")).toHaveTextContent("list");
    browserForward();
    expect(screen.getByRole("status")).toHaveTextContent("view");
    expect(push).toHaveBeenCalledTimes(pushes);
    browserBack();
    expect(screen.getByRole("status")).toHaveTextContent("list");
  });

  it("retains backward compatibility for history entries without pane metadata", () => {
    const { result } = renderHook(() => useMobilePane("view"));
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: null })));
    expect(result.current.mobilePane).toBe("list");
    act(() =>
      window.dispatchEvent(new PopStateEvent("popstate", { state: { mobilePane: "invalid" } })),
    );
    expect(result.current.mobilePane).toBe("sidebar");
  });

  it.each(["view", "sidebar"] as const)(
    "returns to the list after in-app Back from a %s start",
    (initial) => {
      render(<ReaderFixture initial={initial} />);
      if (initial === "sidebar") {
        fireEvent.click(screen.getByRole("button", { name: "Open list" }));
        fireEvent.click(screen.getByRole("button", { name: "Open article" }));
      }
      fireEvent.click(screen.getByRole("button", { name: "Open list" }));
      expect(window.history.state.mobilePane).toBe("list");
      fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
      fireEvent.click(screen.getByRole("button", { name: "フォーカスモード終了" }));
      finishBack();
      expect(screen.getByRole("status")).toHaveTextContent("list");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it.each(["button", "Escape"] as const)(
    "%s dismisses the production overlay and restores reader focus without scrolling",
    (close) => {
      render(<ReaderFixture />);
      const base = screen.getByTestId("base-reader");
      base.scrollTop = 640;
      const trigger = screen.getByRole("button", { name: "Open reader focus" });
      trigger.focus();
      const focus = vi.spyOn(trigger, "focus");
      fireEvent.click(trigger);
      const exit = screen.getByRole("button", { name: "フォーカスモード終了" });
      expect(exit).toHaveFocus();
      if (close === "button") fireEvent.click(exit);
      else fireEvent.keyDown(exit, { key: "Escape" });
      expect(exit).toHaveFocus();
      finishBack();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
      expect(screen.getByTestId("base-reader")).toBe(base);
      expect(base.scrollTop).toBe(640);
      expect(back).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent("view");
    },
  );

  it.each([
    ["image gallery", false],
    ["download", false],
    ["image gallery", true],
    ["download", true],
  ] as const)("%s owns its first Escape (document root: %s)", async (child, atDocument) => {
    if (atDocument) {
      documentRoot = createRoot(document);
      await act(async () =>
        documentRoot!.render(
          <html>
            <body>
              <ReaderFixture />
            </body>
          </html>,
        ),
      );
    } else render(<ReaderFixture />);
    const view = within(document.body);
    await act(async () => fireEvent.click(view.getByRole("button", { name: "Open reader focus" })));
    const childTrigger = view.getByRole("button", {
      name: child === "image gallery" ? "画像 1 を拡大" : "Open download dialog",
    });
    childTrigger.focus();
    await act(async () => fireEvent.click(childTrigger));
    expect(view.getAllByRole("dialog")).toHaveLength(2);
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
    expect(view.getAllByRole("dialog")).toHaveLength(1);
    expect(view.getByRole("dialog", { name: "フォーカスモード" })).toBeInTheDocument();
    expect(childTrigger).toHaveFocus();
    expect(back).not.toHaveBeenCalled();
    await act(async () => fireEvent.keyDown(childTrigger, { key: "Escape" }));
    expect(back).toHaveBeenCalledTimes(1);
    await act(async () => finishBack());
    expect(view.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("mixed in-app and browser pane navigation", () => {
  it("releases an unmounted focus owner before ordinary pane navigation resumes", () => {
    const first = renderHook(() => ({
      pane: useMobilePane("sidebar"),
      focus: useFocusMode(),
    }));
    act(() => first.result.current.pane.setMobilePane("list"));
    act(() => first.result.current.pane.setMobilePane("view"));
    act(() => first.result.current.focus.toggleFocusMode());
    expect(hasFocusHistoryOwner()).toBe(true);
    first.unmount();
    expect(hasFocusHistoryOwner()).toBe(false);
    const { result } = renderHook(() => useMobilePane("list"));
    act(() => result.current.setMobilePane("view"));
    browserBack();
    expect(result.current.mobilePane).toBe("list");
    browserForward();
    expect(result.current.mobilePane).toBe("view");
  });

  it("keeps pane re-entry within a focus close that is still awaiting Back", () => {
    const { result } = renderHook(() => ({
      pane: useMobilePane("sidebar"),
      focus: useFocusMode(),
    }));
    act(() => result.current.pane.setMobilePane("list"));
    act(() => result.current.pane.setMobilePane("view"));
    act(() => result.current.focus.toggleFocusMode());
    const pushes = push.mock.calls.length;
    act(() => result.current.focus.exitFocusMode());
    act(() => result.current.pane.setMobilePane("list"));
    act(() => result.current.pane.setMobilePane("view"));
    expect(push).toHaveBeenCalledTimes(pushes);
    expect(hasFocusHistoryOwner()).toBe(true);
    finishBack();
    expect(hasFocusHistoryOwner()).toBe(false);
    expectClosed({ current: result.current.focus });
    expect(result.current.pane.mobilePane).toBe("view");
    browserBack();
    expect(result.current.pane.mobilePane).toBe("list");
  });

  it.each([
    ["button", false],
    ["browser", false],
    ["button", true],
    ["browser", true],
  ] as const)(
    "keeps one focus entry through in-overlay article re-entry (%s, router replacement: %s)",
    (close, replaceMetadata) => {
      const { result } = renderHook(() => ({
        pane: useMobilePane("sidebar"),
        focus: useFocusMode(),
      }));
      act(() => result.current.pane.setMobilePane("list"));
      act(() => result.current.pane.setMobilePane("view"));
      act(() => result.current.focus.toggleFocusMode());
      const focusIndex = index;
      const pushes = push.mock.calls.length;
      act(() => result.current.pane.setMobilePane("list"));
      if (replaceMetadata) {
        entries[index - 1] = { router: "next-base" };
        entries[index] = { router: "next-current" };
      }
      act(() => result.current.pane.setMobilePane("view"));
      expect(index).toBe(focusIndex);
      expect(push).toHaveBeenCalledTimes(pushes);
      if (close === "button") {
        act(() => result.current.focus.exitFocusMode());
        finishBack();
      } else browserBack();
      expectClosed({ current: result.current.focus });
      expect(result.current.pane.mobilePane).toBe("view");
      browserBack();
      expect(result.current.pane.mobilePane).toBe("list");
      browserForward();
      expect(result.current.pane.mobilePane).toBe("view");
    },
  );

  it.each([
    ["reader", "button", false],
    ["reader", "button", true],
    ["reader", "browser", false],
    ["reader", "browser", true],
    ["list", "button", false],
    ["list", "button", true],
    ["list", "browser", false],
    ["list", "browser", true],
  ] as const)(
    "keeps %s focus return after router metadata replacement (%s, replace current: %s)",
    (mode, close, replaceCurrent) => {
      const { result } = renderHook(() => ({
        pane: useMobilePane("sidebar"),
        focus: useFocusMode(),
      }));
      act(() => result.current.pane.setMobilePane("list"));
      if (mode === "reader") act(() => result.current.pane.setMobilePane("view"));
      const baseIndex = index;
      const pane = result.current.pane.mobilePane;
      act(() =>
        mode === "reader"
          ? result.current.focus.toggleFocusMode()
          : result.current.focus.toggleListFocusMode(),
      );
      // Next router.replace can replace custom session metadata on either
      // the base or the current entry. Model that boundary without a server.
      entries[baseIndex] = { router: "next-base" };
      if (replaceCurrent) entries[index] = { router: "next-current" };
      if (close === "button") {
        act(() => result.current.focus.exitFocusMode());
        finishBack();
      } else browserBack();
      expect(result.current.pane.mobilePane).toBe(pane);
      expectClosed({ current: result.current.focus });
      expect(window.history.state.router).toBe("next-base");
      browserBack();
      expect(result.current.pane.mobilePane).toBe(mode === "reader" ? "list" : "sidebar");
      browserForward();
      expect(result.current.pane.mobilePane).toBe(pane);
    },
  );

  it("migrates older entries without indices while retaining the previous-pane Back fallback", () => {
    entries = [{ router: "kept" }, { mobilePane: "list" }, { mobilePane: "view" }];
    index = 2;
    const { result } = renderHook(() => useMobilePane("view"));
    act(() => result.current.setMobilePane("list"));
    browserBack();
    expect(result.current.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.mobilePane).toBe("list");
    browserBack();
    expect(result.current.mobilePane).toBe("sidebar");
    browserBack();
    expect(result.current.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.mobilePane).toBe("list");
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ["view", "list"],
    ["list", "sidebar"],
  ] as const)("keeps the %s in-app Back to %s while focus is open", (from, destination) => {
    const { result } = renderHook(() => ({
      pane: useMobilePane("sidebar"),
      focus: useFocusMode(),
    }));
    act(() => result.current.pane.setMobilePane("list"));
    if (from === "view") act(() => result.current.pane.setMobilePane("view"));
    act(() => result.current.focus.toggleFocusMode());
    act(() => result.current.pane.setMobilePane(destination));
    act(() => result.current.focus.exitFocusMode());
    finishBack();
    expect(result.current.pane.mobilePane).toBe(destination);
    expect(result.current.focus.focusMode).toBe(false);
    browserBack();
    expect(result.current.pane.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.pane.mobilePane).toBe(destination);
  });

  it("advances to sidebar with one browser Back after the article's in-app Back", () => {
    const { result } = renderHook(() => useMobilePane("sidebar"));
    act(() => result.current.setMobilePane("list"));
    act(() => result.current.setMobilePane("view"));
    expect(entries[1]?.router).toBe("kept");
    expect(entries[2]?.router).toBe("kept");
    act(() => result.current.setMobilePane("list"));
    browserBack();
    expect(result.current.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.mobilePane).toBe("list");
    browserBack();
    expect(result.current.mobilePane).toBe("sidebar");
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("keeps sidebar after list in-app Back and restores the app-chosen pane on Forward", () => {
    const { result } = renderHook(() => useMobilePane("sidebar"));
    act(() => result.current.setMobilePane("list"));
    act(() => result.current.setMobilePane("sidebar"));
    browserBack();
    expect(result.current.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.mobilePane).toBe("sidebar");
    expect(push).toHaveBeenCalledOnce();
  });

  it("does not strand repeated article re-entry behind equal list entries", () => {
    const { result } = renderHook(() => useMobilePane("sidebar"));
    act(() => result.current.setMobilePane("list"));
    for (let visit = 0; visit < 3; visit += 1) {
      act(() => result.current.setMobilePane("view"));
      act(() => result.current.setMobilePane("list"));
      browserBack();
      expect(result.current.mobilePane).toBe("sidebar");
      browserForward();
      expect(result.current.mobilePane).toBe("list");
    }
    expect(push).toHaveBeenCalledTimes(4);
  });

  it("distinguishes focus-only Back after in-app Back from the next ordinary Back", () => {
    const { result } = renderHook(() => ({
      pane: useMobilePane("sidebar"),
      focus: useFocusMode(),
    }));
    act(() => result.current.pane.setMobilePane("list"));
    act(() => result.current.pane.setMobilePane("view"));
    act(() => result.current.pane.setMobilePane("list"));
    act(() => result.current.focus.toggleFocusMode());
    act(() => {
      result.current.focus.exitFocusMode();
      result.current.focus.exitFocusMode();
    });
    finishBack();
    expect(result.current.focus.focusMode).toBe(false);
    expect(result.current.pane.mobilePane).toBe("list");
    browserBack();
    expect(result.current.pane.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.pane.mobilePane).toBe("list");
    expect(push).toHaveBeenCalledTimes(3);
  });

  it("retains mixed Back behavior after remounting at the in-app list destination", () => {
    const first = renderHook(() => useMobilePane("sidebar"));
    act(() => first.result.current.setMobilePane("list"));
    act(() => first.result.current.setMobilePane("view"));
    act(() => first.result.current.setMobilePane("list"));
    first.unmount();
    const { result } = renderHook(() => useMobilePane("list"));
    browserBack();
    expect(result.current.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.mobilePane).toBe("list");
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("keeps the current pane when Forward revisits a departed focus entry and focus reopens", () => {
    const { result } = renderHook(() => ({
      pane: useMobilePane("sidebar"),
      focus: useFocusMode(),
    }));
    act(() => result.current.pane.setMobilePane("list"));
    act(() => result.current.pane.setMobilePane("view"));
    act(() => result.current.focus.toggleFocusMode());
    browserBack();
    act(() => result.current.pane.setMobilePane("list"));
    browserForward();
    expect(result.current.pane.mobilePane).toBe("list");
    expect(result.current.focus.focusMode).toBe(false);
    act(() => result.current.focus.toggleFocusMode());
    act(() => result.current.focus.exitFocusMode());
    finishBack();
    expect(result.current.pane.mobilePane).toBe("list");
    browserBack();
    expect(result.current.pane.mobilePane).toBe("sidebar");
    browserForward();
    expect(result.current.pane.mobilePane).toBe("list");
  });

  it("keeps mixed Back navigation when reloaded on a departed focus marker", () => {
    const first = renderHook(() => ({
      pane: useMobilePane("sidebar"),
      focus: useFocusMode(),
    }));
    act(() => first.result.current.pane.setMobilePane("list"));
    act(() => first.result.current.pane.setMobilePane("view"));
    act(() => first.result.current.pane.setMobilePane("list"));
    act(() => first.result.current.focus.toggleFocusMode());
    first.unmount();
    const { result } = renderHook(() => ({
      pane: useMobilePane("list"),
      focus: useFocusMode(),
    }));
    act(() => result.current.focus.toggleFocusMode());
    act(() => result.current.focus.exitFocusMode());
    finishBack();
    expect(result.current.pane.mobilePane).toBe("list");
    browserBack();
    expect(result.current.pane.mobilePane).toBe("sidebar");
  });
});
