import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VisualModeBar from "../components/VisualModeBar";
import { STORAGE_KEYS } from "../lib/storage";
import { VisualModeProvider, useVisualMode } from "./VisualModeContext";

vi.mock("../lib/dev-log", () => ({ devError: vi.fn() }));

class MotionPreference extends EventTarget {
  matches = false;
  setReduced(value: boolean) {
    this.matches = value;
    this.dispatchEvent(new Event("change"));
  }
}

class Connection extends EventTarget {
  saveData = false;
}

let reduced: MotionPreference;
let connection: Connection;
let device: { hardwareConcurrency: number; deviceMemory?: number; connection: Connection };
let visibility: DocumentVisibilityState;

beforeEach(() => {
  localStorage.clear();
  reduced = new MotionPreference();
  connection = new Connection();
  device = { hardwareConcurrency: 8, deviceMemory: 8, connection };
  visibility = "visible";
  vi.stubGlobal("navigator", device);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => reduced),
  );
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.visualMode;
  delete document.documentElement.dataset.visualMotion;
});

function renderVisualMode() {
  return renderHook(() => useVisualMode(), { wrapper: VisualModeProvider });
}

function Reader() {
  const [count, setCount] = useState(0);
  return (
    <section aria-label="Reader state">
      <input aria-label="Search" defaultValue="saved search" />
      <button onClick={() => setCount((previous) => previous + 1)}>Selected {count}</button>
    </section>
  );
}

describe("VisualModeProvider", () => {
  it("starts in normal mode without writing a preference or changing the document theme", () => {
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderVisualMode();
    expect(result.current.enabled).toBe(false);
    expect(result.current.motionEnabled).toBe(true);
    expect(result.current.motionAllowed).toBe(false);
    expect(document.documentElement).not.toHaveAttribute("data-visual-mode");
    expect(document.documentElement).not.toHaveAttribute("data-visual-motion");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["normal", "invalid", "true", '{"mode":"cinema"}', ""])(
    "does not enable visual mode for unrecognized or normal storage value %j",
    (value) => {
      localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, value);
      expect(renderVisualMode().result.current.enabled).toBe(false);
      expect(document.documentElement).not.toHaveAttribute("data-visual-mode");
    },
  );

  it("restores a valid mode and independently saved motion preference", () => {
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    localStorage.setItem(STORAGE_KEYS.VISUAL_MOTION, "off");
    const { result } = renderVisualMode();
    expect(result.current.enabled).toBe(true);
    expect(result.current.motionEnabled).toBe(false);
    expect(result.current.motionAllowed).toBe(false);
    expect(document.documentElement).toHaveAttribute("data-visual-mode", "cinema");
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "still");
    act(() => result.current.toggleMotion());
    expect(result.current.motionAllowed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MOTION)).toBe("on");
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "full");
  });

  it("keeps controls usable when storage reads and writes throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    const { result } = renderVisualMode();
    expect(result.current.enabled).toBe(false);
    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    act(() => result.current.toggleMotion());
    expect(result.current.motionEnabled).toBe(false);
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
  });

  it("toggles through the real controls without remounting reader state or changing theme and scroll", () => {
    localStorage.setItem(STORAGE_KEYS.THEME, "dark");
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
    render(
      <VisualModeProvider>
        <VisualModeBar />
        <Reader />
      </VisualModeProvider>,
    );
    const reader = screen.getByRole("region", { name: "Reader state" });
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "edited search" } });
    fireEvent.click(screen.getByRole("button", { name: "Selected 0" }));
    reader.scrollTop = 340;
    fireEvent.click(screen.getByRole("button", { name: "ビジュアル表示" }));
    expect(document.documentElement).toHaveAttribute("data-visual-mode", "cinema");
    expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MODE)).toBe("cinema");
    fireEvent.click(screen.getByRole("button", { name: "動き ON" }));
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "still");
    expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MOTION)).toBe("off");
    fireEvent.click(screen.getByRole("button", { name: "通常表示に戻す" }));
    expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MODE)).toBe("normal");
    expect(screen.getByRole("textbox", { name: "Search" })).toBe(input);
    expect(input).toHaveValue("edited search");
    expect(screen.getByRole("button", { name: "Selected 1" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Reader state" })).toBe(reader);
    expect(reader.scrollTop).toBe(340);
    expect(document.documentElement).not.toHaveAttribute("data-visual-mode");
    expect(document.documentElement).not.toHaveAttribute("data-visual-motion");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe("dark");
  });

  it("reacts to reduced-motion changes and keeps the user's stored motion choice", () => {
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    const { result } = renderVisualMode();
    expect(result.current.motionAllowed).toBe(true);
    act(() => reduced.setReduced(true));
    expect(result.current.motionAllowed).toBe(false);
    expect(result.current.motionReason).toBe("端末の動きを減らす設定");
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "still");
    act(() => result.current.toggleMotion());
    act(() => reduced.setReduced(false));
    expect(result.current.motionReason).toBe("");
    expect(result.current.motionEnabled).toBe(false);
    expect(result.current.motionAllowed).toBe(false);
    act(() => result.current.toggleMotion());
    expect(result.current.motionAllowed).toBe(true);
  });

  it("falls back to still mode for data saving and updates when the connection changes", () => {
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    connection.saveData = true;
    const { result } = renderVisualMode();
    expect(result.current.motionAllowed).toBe(false);
    expect(result.current.motionReason).toBe("データ節約設定");
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "still");
    act(() => {
      connection.saveData = false;
      connection.dispatchEvent(new Event("change"));
    });
    expect(result.current.motionAllowed).toBe(true);
  });

  it.each([
    { memory: 4, cores: 8 },
    { memory: 8, cores: 2 },
  ])("uses a static fallback on a weak device: %j", ({ memory, cores }) => {
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    device.deviceMemory = memory;
    device.hardwareConcurrency = cores;
    const { result } = renderVisualMode();
    expect(result.current.motionAllowed).toBe(false);
    expect(result.current.motionReason).toBe("軽量表示");
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "still");
  });

  it("does not mistake missing device hints for a weak device", () => {
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    delete device.deviceMemory;
    device.hardwareConcurrency = 0;
    expect(renderVisualMode().result.current.motionAllowed).toBe(true);
  });

  it("pauses document motion when hidden without overwriting preferences", () => {
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    const { result } = renderVisualMode();
    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.pageVisible).toBe(false);
    expect(result.current.motionAllowed).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "still");
    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.pageVisible).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-visual-motion", "full");
    expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MODE)).toBe("cinema");
    expect(localStorage.getItem(STORAGE_KEYS.VISUAL_MOTION)).toBeNull();
  });

  it("synchronizes relevant cross-tab changes and clears preferences on a storage-clear event", () => {
    const { result } = renderVisualMode();
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.THEME })));
    expect(result.current.enabled).toBe(false);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.VISUAL_MODE })));
    expect(result.current.enabled).toBe(true);
    localStorage.setItem(STORAGE_KEYS.VISUAL_MOTION, "off");
    act(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.VISUAL_MOTION })),
    );
    expect(result.current.motionAllowed).toBe(false);
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(result.current.enabled).toBe(false);
    expect(result.current.motionEnabled).toBe(true);
  });

  it("removes document attributes and all subscriptions when unmounted", () => {
    localStorage.setItem(STORAGE_KEYS.VISUAL_MODE, "cinema");
    const reducedRemove = vi.spyOn(reduced, "removeEventListener");
    const connectionRemove = vi.spyOn(connection, "removeEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderVisualMode();
    expect(document.documentElement).toHaveAttribute("data-visual-mode", "cinema");
    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-visual-mode");
    expect(document.documentElement).not.toHaveAttribute("data-visual-motion");
    expect(reducedRemove).toHaveBeenCalledWith("change", expect.any(Function));
    expect(connectionRemove).toHaveBeenCalledWith("change", expect.any(Function));
    expect(documentRemove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(windowRemove).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});
