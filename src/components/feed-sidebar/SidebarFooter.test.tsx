import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import SidebarFooter from "./SidebarFooter";
import { getPopupOpenCount } from "../../lib/popup-lock";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => toast }));

function makeProps(): ComponentProps<typeof SidebarFooter> {
  return {
    user: { id: "user", sub: "user", name: "Reader", email: "reader@example.test", picture: null },
    theme: "light",
    importing: false,
    onImport: vi.fn(),
    onShowReleaseNotes: vi.fn(),
    onShowStats: vi.fn(),
    onExportOpml: vi.fn(),
    onExportMarkdown: vi.fn(),
    onExportJson: vi.fn(),
    onExportNotes: vi.fn(),
    onExportNotesJson: vi.fn(),
    onExportReadwise: vi.fn(),
    onExportCollectionMarkdown: vi.fn(),
    onExportCollectionJson: vi.fn(),
    selectedCollectionName: "Design",
    noteCount: 2,
    install: { canInstall: true, onInstall: vi.fn() },
    push: {
      supported: true,
      subscribed: true,
      loading: false,
      error: null,
      onToggle: vi.fn(),
      onSendTest: vi.fn().mockResolvedValue("送信しました"),
    },
    onShowFeedHealth: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenHelp: vi.fn(),
    onToggleTheme: vi.fn(),
    onLogout: vi.fn(),
    readTodayCount: 3,
    weeklyGoal: 20,
  };
}

function openMenu() {
  const trigger = screen.getByRole("button", { name: "その他のメニュー" });
  fireEvent.click(trigger);
  const menu = screen.getByRole("menu", { name: "その他のメニュー" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(trigger).toHaveAttribute("aria-controls", menu.id);
  return { trigger, menu };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("SidebarFooter の主要導線", () => {
  it("常設ボタンは設定とその他だけにし、プロフィールと今日の読了数を残す", () => {
    const props = makeProps();
    render(<SidebarFooter {...props} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("Reader")).toBeVisible();
    expect(screen.getByText("今日 3件")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ユーザー設定" }));
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
  });

  it("低頻度の機能と条件付きエクスポートへメニューから到達できる", () => {
    render(<SidebarFooter {...makeProps()} />);
    const { menu } = openMenu();
    for (const name of [
      "読書統計",
      "ダークモードに切替",
      "キーボードショートカット (?)",
      "OPML インポート",
      "OPML エクスポート",
      "ブックマーク → Markdown",
      "後で読む → Markdown",
      "ブックマーク → JSON",
      "後で読む → JSON",
      "メモを Markdown で出力 (2件)",
      "メモを JSON で出力 (2件)",
      "メモを Readwise CSV で出力 (2件)",
      "「Design」を Markdown で出力",
      "「Design」を JSON で出力",
      "フィードヘルス",
      "リリースノート",
      "アプリをインストール",
      "ログアウト",
    ]) {
      expect(within(menu).getByRole("menuitem", { name })).toBeVisible();
    }
    expect(
      within(menu).getByRole("menuitemcheckbox", { name: "プッシュ通知", checked: true }),
    ).toBeVisible();
    expect(menu).toHaveClass("overflow-y-auto");
    expect(menu).toHaveAttribute("data-print", "hide");
    // Sidebar の overflow-hidden にクリップされない。
    expect(menu.parentElement).toBe(document.body);
  });

  it.each([
    ["読書統計", "onShowStats"],
    ["ダークモードに切替", "onToggleTheme"],
    ["キーボードショートカット (?)", "onOpenHelp"],
    ["OPML インポート", "onImport"],
    ["OPML エクスポート", "onExportOpml"],
    ["フィードヘルス", "onShowFeedHealth"],
    ["リリースノート", "onShowReleaseNotes"],
    ["ログアウト", "onLogout"],
  ] as const)("%s を選ぶと一度だけ実行しメニューを閉じる", (name, callback) => {
    const props = makeProps();
    render(<SidebarFooter {...props} />);
    const { menu, trigger } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name }));
    expect(props[callback]).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("矢印・Home・End・Escapeで操作でき、無効な項目を飛ばす", async () => {
    const props = makeProps();
    props.importing = true;
    props.push!.loading = true;
    render(<SidebarFooter {...props} />);
    const { menu, trigger } = openMenu();
    const first = within(menu).getByRole("menuitem", { name: "読書統計" });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(menu, { key: "End" });
    expect(within(menu).getByRole("menuitem", { name: "ログアウト" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(first).toHaveFocus();
    const enabledItems = Array.from(
      menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
    ).filter((item) => !item.matches(':disabled, [aria-disabled="true"]'));
    for (const item of enabledItems.slice(1)) {
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(item).toHaveFocus();
    }
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("通知テストをタッチ・キーボードで選べ、結果を通知する", async () => {
    const props = makeProps();
    render(<SidebarFooter {...props} />);
    const { menu } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "テスト通知を送信" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("送信しました"));
    expect(props.push!.onSendTest).toHaveBeenCalledOnce();
  });

  it("未対応の通知・インストール・メモ出力を表示しない", () => {
    const props = makeProps();
    props.push!.supported = false;
    props.install!.canInstall = false;
    props.noteCount = 0;
    render(<SidebarFooter {...props} />);
    const { menu } = openMenu();
    expect(within(menu).queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
    expect(within(menu).queryByText("テスト通知を送信")).not.toBeInTheDocument();
    expect(within(menu).queryByText("アプリをインストール")).not.toBeInTheDocument();
    expect(within(menu).queryByText(/メモを/)).not.toBeInTheDocument();
  });
  it.each([
    ["ブックマーク → Markdown", "onExportMarkdown", "bookmark"],
    ["後で読む → Markdown", "onExportMarkdown", "reading_list"],
    ["ブックマーク → JSON", "onExportJson", "bookmark"],
    ["後で読む → JSON", "onExportJson", "reading_list"],
  ] as const)("%s の形式と対象を維持する", (name, callback, mode) => {
    const props = makeProps();
    render(<SidebarFooter {...props} />);
    const { menu } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name }));
    expect(props[callback]).toHaveBeenCalledExactlyOnceWith(mode);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("繰り返し開閉しても背景操作のロックを残さない", () => {
    const { unmount } = render(<SidebarFooter {...makeProps()} />);
    expect(getPopupOpenCount()).toBe(0);
    const { trigger } = openMenu();
    expect(getPopupOpenCount()).toBe(1);
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(getPopupOpenCount()).toBe(0);
    fireEvent.click(trigger);
    expect(getPopupOpenCount()).toBe(1);
    unmount();
    expect(getPopupOpenCount()).toBe(0);
  });

  it("メニュー外タップ・ウィンドウリサイズで閉じ、再度開ける", async () => {
    render(<SidebarFooter {...makeProps()} />);
    const { menu, trigger } = openMenu();
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: "読書統計" })).toHaveFocus(),
    );
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.resize(window);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(getPopupOpenCount()).toBe(0);
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("狭いサイドバーでもメニューの左端と上端を画面内に収める", () => {
    render(<SidebarFooter {...makeProps()} />);
    const trigger = screen.getByRole("button", { name: "その他のメニュー" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ top: 400, right: 188 } as DOMRect);
    const { menu } = openMenu();
    expect(menu).toHaveStyle({
      left: "12px",
      maxHeight: "384px",
      bottom: `${window.innerHeight - 396}px`,
    });
  });

  it("通知切替中と失敗後もメニューで状態を確認できる", () => {
    const props = makeProps();
    props.push!.subscribed = false;
    const { rerender } = render(<SidebarFooter {...props} />);
    const { menu } = openMenu();
    const toggle = within(menu).getByRole("menuitemcheckbox", {
      name: "プッシュ通知",
      checked: false,
    });
    expect(within(menu).queryByText("テスト通知を送信")).not.toBeInTheDocument();
    toggle.focus();
    fireEvent.click(toggle);
    expect(props.push!.onToggle).toHaveBeenCalledOnce();
    expect(menu).toBeVisible();
    rerender(<SidebarFooter {...props} push={{ ...props.push!, loading: true }} />);
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(props.push!.onToggle).toHaveBeenCalledOnce();
    rerender(
      <SidebarFooter
        {...props}
        push={{ ...props.push!, loading: false, error: "通知の許可が必要です" }}
      />,
    );
    expect(within(menu).getByRole("status")).toHaveTextContent("通知の許可が必要です");
    expect(toggle).toHaveAttribute("aria-disabled", "false");
  });

  it("通知テスト失敗時もエラーを示しメニューのロックを解除する", async () => {
    const props = makeProps();
    props.push!.onSendTest = vi.fn().mockRejectedValue(new Error("送信に失敗"));
    render(<SidebarFooter {...props} />);
    const { menu } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "テスト通知を送信" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("送信に失敗"));
    expect(getPopupOpenCount()).toBe(0);
  });
});
