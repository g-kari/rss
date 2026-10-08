import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import SidebarHeader from "./SidebarHeader";
import { useNSFWMode } from "../../hooks/useNSFWMode";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";
import { STORAGE_KEYS } from "../../lib/storage";
import { makeKeyboardNavFixture } from "../../../e2e/helpers/keyboard-nav-fixture";

function makeProps(): ComponentProps<typeof SidebarHeader> {
  return {
    nsfwMode: true,
    inputOpen: false,
    refreshing: false,
    isOnline: true,
    onActivateNsfw: vi.fn(),
    onDeactivateNsfw: vi.fn(),
    onToggleInput: vi.fn(),
    onRefresh: vi.fn(),
  };
}

function ModeFixture() {
  const mode = useNSFWMode();
  return (
    <>
      <SidebarHeader
        {...makeProps()}
        nsfwMode={mode.nsfwMode}
        onActivateNsfw={mode.activateNSFW}
        onDeactivateNsfw={mode.deactivateNSFW}
      />
      <output aria-label="モード">{String(mode.nsfwMode)}</output>
      <output aria-label="有効化演出">{String(mode.showNSFWAnimation)}</output>
    </>
  );
}

function KeyboardFixture() {
  useKeyboardNav(makeKeyboardNavFixture());
  return (
    <>
      <ModeFixture />
      <main aria-label="記事本文">Synthetic article</main>
    </>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe("SidebarHeader の通常モード解除", () => {
  it("選択記事のグローバルSpaceショートカットから解除ボタンのnative activationを守る", () => {
    localStorage.setItem(STORAGE_KEYS.NSFW_MODE, "1");
    render(<KeyboardFixture />);
    const main = screen.getByRole("main", { name: "記事本文" });
    const scroll = vi.fn();
    main.scrollBy = scroll;
    const exit = screen.getByRole("button", { name: "NSFWモード解除" });
    exit.focus();
    const space = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    fireEvent(exit, space);
    expect(space.defaultPrevented).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
    // happy-dom does not synthesize the browser's native keyup click.
    fireEvent.click(exit);
    const group = screen.getByRole("group", { name: "サイドバー操作" });
    fireEvent.keyDown(group, { key: " ", code: "Space" });
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByLabelText("モード")).toHaveTextContent("false");
    fireEvent.keyDown(document.body, { key: " ", code: "Space" });
    expect(scroll).toHaveBeenCalledOnce();
  });
  it("有効なときだけ名前付き解除ボタンを表示し、一度のクリックで既存 callback を呼ぶ", () => {
    const props = makeProps();
    const { rerender } = render(<SidebarHeader {...props} />);
    const exit = screen.getByRole("button", { name: "NSFWモード解除" });
    expect(exit).toHaveTextContent("NSFWモード解除");
    fireEvent.click(exit);
    expect(props.onDeactivateNsfw).toHaveBeenCalledOnce();
    expect(props.onActivateNsfw).not.toHaveBeenCalled();
    rerender(<SidebarHeader {...props} nsfwMode={false} />);
    expect(screen.queryByRole("button", { name: "NSFWモード解除" })).toBeNull();
  });

  it("保存済みモードを即時解除し、リロード相当の再描画でも無効のままにする", () => {
    localStorage.setItem(STORAGE_KEYS.NSFW_MODE, "1");
    const { unmount } = render(<ModeFixture />);
    const exit = screen.getByRole("button", { name: "NSFWモード解除" });
    exit.focus();
    fireEvent.click(exit);
    expect(screen.getByLabelText("モード")).toHaveTextContent("false");
    expect(screen.getByLabelText("有効化演出")).toHaveTextContent("false");
    expect(localStorage.getItem(STORAGE_KEYS.NSFW_MODE)).toBe("0");
    expect(screen.getByRole("group", { name: "サイドバー操作" })).toHaveFocus();
    unmount();
    render(<ModeFixture />);
    expect(screen.queryByRole("button", { name: "NSFWモード解除" })).toBeNull();
  });

  it("オフラインでも解除でき、いつもの追加・更新操作は変えない", () => {
    const props = makeProps();
    const { rerender } = render(<SidebarHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "フィードを追加" }));
    fireEvent.click(screen.getByRole("button", { name: "フィードを更新" }));
    expect(props.onToggleInput).toHaveBeenCalledOnce();
    expect(props.onRefresh).toHaveBeenCalledOnce();
    rerender(<SidebarHeader {...props} isOnline={false} />);
    expect(screen.getByRole("button", { name: "NSFWモード解除" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "オフライン" })).toHaveLength(2);
  });

  it.each(["pointerUp", "pointerLeave", "pointerCancel"] as const)(
    "%s で中断した長押しは解除しない",
    (event) => {
      vi.useFakeTimers();
      const props = makeProps();
      render(<SidebarHeader {...props} />);
      const logo = screen.getByRole("button", { name: /^RSS$/ });
      fireEvent.pointerDown(logo, { button: 0 });
      act(() => vi.advanceTimersByTime(300));
      fireEvent[event](logo);
      act(() => vi.advanceTimersByTime(600));
      expect(props.onDeactivateNsfw).not.toHaveBeenCalled();
    },
  );

  it("長押しを維持し、解除後の release click は有効化へ送らない", () => {
    vi.useFakeTimers();
    const props = makeProps();
    render(<SidebarHeader {...props} />);
    const logo = screen.getByRole("button", { name: /^RSS$/ });
    fireEvent.pointerDown(logo, { button: 0 });
    act(() => vi.advanceTimersByTime(600));
    expect(props.onDeactivateNsfw).toHaveBeenCalledOnce();
    fireEvent.pointerUp(logo);
    fireEvent.click(logo, { detail: 1 });
    expect(props.onActivateNsfw).not.toHaveBeenCalled();
    fireEvent.click(logo);
    expect(props.onActivateNsfw).toHaveBeenCalledOnce();
  });

  it("待機中の長押しは unmount で破棄する", () => {
    vi.useFakeTimers();
    const props = makeProps();
    const { unmount } = render(<SidebarHeader {...props} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /^RSS$/ }), { button: 0 });
    unmount();
    act(() => vi.advanceTimersByTime(600));
    expect(props.onDeactivateNsfw).not.toHaveBeenCalled();
  });

  it("長押し後にpointer cancelされた場合も次のkeyboard activationは妨げない", () => {
    vi.useFakeTimers();
    const props = makeProps();
    render(<SidebarHeader {...props} />);
    const logo = screen.getByRole("button", { name: /^RSS$/ });
    fireEvent.pointerDown(logo, { button: 0 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerCancel(logo);
    fireEvent.click(logo, { detail: 0 });
    expect(props.onActivateNsfw).toHaveBeenCalledOnce();
  });

  it("無効時の通常ロゴ操作と既存の5回連打による有効化条件を維持する", () => {
    render(<ModeFixture />);
    const logo = screen.getByRole("button", { name: /^RSS$/ });
    for (let i = 0; i < 4; i++) fireEvent.click(logo);
    expect(screen.getByLabelText("有効化演出")).toHaveTextContent("false");
    fireEvent.click(logo);
    expect(screen.getByLabelText("有効化演出")).toHaveTextContent("true");
    expect(screen.getByLabelText("モード")).toHaveTextContent("false");
  });
  it("フィード追加は常に見えるラベル付きの主操作として表示し、accessible name を維持する", () => {
    const props = makeProps();
    render(<SidebarHeader {...props} nsfwMode={false} />);
    const add = screen.getByRole("button", { name: "フィードを追加" });
    expect(add).toHaveTextContent("追加");
    expect(add).toHaveClass("bg-accent", "text-accent-contrast");
    fireEvent.click(add);
    expect(props.onToggleInput).toHaveBeenCalledOnce();
  });
});
