import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { TestReaderSettings } from "../../e2e/helpers/reader-settings";
import { useGestureNav } from "../hooks/useGestureNav";
import { sanitizeHtml } from "../lib/html";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { getPopupOpenCount } from "../lib/popup-lock";
import { STORAGE_KEYS } from "../lib/storage";
import QuickReadingSettings from "./QuickReadingSettings";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("shares existing values/setters and persistence, with labeled native controls", () => {
  const { unmount } = render(
    <TestReaderSettings>
      <QuickReadingSettings />
    </TestReaderSettings>,
  );
  fireEvent.click(screen.getByRole("button", { name: "読書設定" }));
  const panel = screen.getByRole("dialog", { name: "読書設定" });
  expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  for (const [label, value, key] of [
    ["文字サイズ", "large", STORAGE_KEYS.FONT_SIZE],
    ["フォント", "serif", STORAGE_KEYS.FONT_FAMILY],
    ["行間", "loose", STORAGE_KEYS.LINE_HEIGHT],
    ["本文の幅", "wide", STORAGE_KEYS.CONTENT_WIDTH],
    ["テーマ", "dark", STORAGE_KEYS.THEME],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(localStorage.getItem(key)).toBe(value);
  }
  expect(getPopupOpenCount()).toBe(1);
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "読書設定" })).toHaveFocus();
  expect(getPopupOpenCount()).toBe(0);
  unmount();
  render(
    <TestReaderSettings>
      <QuickReadingSettings />
    </TestReaderSettings>,
  );
  fireEvent.click(screen.getByRole("button", { name: "読書設定" }));
  expect(screen.getByLabelText("文字サイズ")).toHaveValue("large");
  expect(screen.getByLabelText("フォント")).toHaveValue("serif");
});
it("closes on repeated trigger, outside pointer, resize and article navigation without leaking locks", () => {
  const { rerender } = render(
    <TestReaderSettings>
      <QuickReadingSettings key="a" />
    </TestReaderSettings>,
  );
  const trigger = screen.getByRole("button", { name: "読書設定" });
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger);
  const outside = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
  fireEvent(document.body, outside);
  expect(outside.defaultPrevented).toBe(true);
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger);
  fireEvent(window, new Event("resize"));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger);
  rerender(
    <TestReaderSettings>
      <QuickReadingSettings key="b" />
    </TestReaderSettings>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(getPopupOpenCount()).toBe(0);
});
it("gives nested panel Escape and Tab priority over a capture-phase reader dialog", () => {
  const parentClose = vi.fn();
  function Parent() {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(true);
    const { handleKeyDown } = useModalFocusTrap(ref, {
      isOpen: open,
      captureEscape: true,
      onClose: () => {
        parentClose();
        setOpen(false);
      },
    });
    return (
      open && (
        <div ref={ref} role="dialog" aria-label="記事" onKeyDown={handleKeyDown}>
          <QuickReadingSettings />
        </div>
      )
    );
  }
  render(
    <TestReaderSettings>
      <Parent />
    </TestReaderSettings>,
  );
  fireEvent.click(screen.getByRole("button", { name: "読書設定" }));
  const last = screen.getByLabelText("テーマ");
  last.focus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(parentClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "記事" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "読書設定" })).toBeNull();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(parentClose).toHaveBeenCalledOnce();
});

it("does not yield capture Escape to publisher HTML that only declares a dialog role", () => {
  const onClose = vi.fn();
  function Parent() {
    const ref = useRef<HTMLDivElement>(null);
    useModalFocusTrap(ref, { onClose, captureEscape: true });
    return (
      <div
        ref={ref}
        role="dialog"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml('<div role="dialog"><a href="#">Publisher link</a></div>'),
        }}
      />
    );
  }
  render(<Parent />);
  const link = screen.getByRole("link", { name: "Publisher link" });
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
it("isolates horizontal wheel and touch gestures from article navigation", () => {
  const next = vi.fn();
  const prev = vi.fn();
  function Parent() {
    const gesture = useGestureNav({ onSelectNext: next, onSelectPrev: prev });
    return (
      <div
        onWheel={gesture.handleWheel}
        onTouchStart={gesture.handleTouchStart}
        onTouchEnd={gesture.handleTouchEnd}
      >
        <QuickReadingSettings />
      </div>
    );
  }
  render(
    <TestReaderSettings>
      <Parent />
    </TestReaderSettings>,
  );
  fireEvent.click(screen.getByRole("button", { name: "読書設定" }));
  const panel = screen.getByRole("dialog", { name: "読書設定" });
  fireEvent.wheel(panel, { deltaX: 200, deltaY: 0 });
  fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 200 }] });
  fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 50, clientY: 200 }] });
  expect(next).not.toHaveBeenCalled();
  expect(prev).not.toHaveBeenCalled();
});

it("registers live refs for dialogs whose DOM appears after their first effect", () => {
  const parentClose = vi.fn();
  const childClose = vi.fn();
  function LateDialog() {
    const ref = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    useModalFocusTrap(ref, { onClose: childClose, captureEscape: true });
    return (
      ready && (
        <div ref={ref} role="dialog">
          <button>Late dialog control</button>
        </div>
      )
    );
  }
  function Parent() {
    const ref = useRef<HTMLDivElement>(null);
    useModalFocusTrap(ref, { onClose: parentClose, captureEscape: true });
    return (
      <div ref={ref} role="dialog">
        <LateDialog />
      </div>
    );
  }
  render(<Parent />);
  const control = screen.getByRole("button", { name: "Late dialog control" });
  control.focus();
  fireEvent.keyDown(control, { key: "Escape" });
  expect(childClose).toHaveBeenCalledOnce();
  expect(parentClose).not.toHaveBeenCalled();
});
