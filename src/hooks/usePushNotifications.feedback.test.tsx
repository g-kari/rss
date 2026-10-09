import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SidebarFooter from "../components/feed-sidebar/SidebarFooter";
import { usePushNotifications } from "./usePushNotifications";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  devError: vi.fn(),
}));
vi.mock("../lib/api-fetch", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("../lib/dev-log", () => ({ devError: mocks.devError }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => mocks }));

// Exercise the real hook's result through its real caller. No service worker,
// permission prompt, subscription or live push is needed for this fixture.
function Fixture() {
  const { sendTest } = usePushNotifications(null);
  return (
    <SidebarFooter
      user={{
        id: "synthetic",
        sub: "synthetic",
        name: "Reader",
        email: "reader@example.test",
        picture: null,
      }}
      theme="light"
      importing={false}
      onImport={() => {}}
      onShowReleaseNotes={() => {}}
      onShowStats={() => {}}
      onExportOpml={() => {}}
      onShowFeedHealth={() => {}}
      onOpenSettings={() => {}}
      onOpenHelp={() => {}}
      onToggleTheme={() => {}}
      onLogout={() => {}}
      push={{
        supported: true,
        subscribed: true,
        loading: false,
        error: null,
        onToggle: () => {},
        onSendTest: sendTest,
      }}
    />
  );
}

function send() {
  const trigger = screen.getByRole("button", { name: "その他のメニュー" });
  fireEvent.click(trigger);
  fireEvent.click(
    within(screen.getByRole("menu", { name: "その他のメニュー" })).getByRole("menuitem", {
      name: "テスト通知を送信",
    }),
  );
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("テスト通知の失敗フィードバック", () => {
  it.each([
    [404, "サブスクリプションが見つかりません (再度購読してください)"],
    [503, "VAPID キーが未設定です (wrangler secret を確認してください)"],
    [401, "送信失敗 (401)"],
    [403, "送信失敗 (403)"],
    [429, "送信失敗 (429)"],
    [500, "送信失敗 (500)"],
  ])("HTTP %i は成功にせず、一度だけエラーを表示する", async (status, message) => {
    mocks.apiFetch.mockResolvedValue(new Response(null, { status: Number(status) }));
    render(<Fixture />);
    send();
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(message));
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.apiFetch).toHaveBeenCalledExactlyOnceWith(
      "/api/push/test",
      { method: "POST" },
      { errorNotification: "caller" },
    );
  });

  it("通信エラーを成功にせず、同じメニューから再試行できる", async () => {
    mocks.apiFetch
      .mockRejectedValueOnce(new TypeError("synthetic network failure"))
      .mockResolvedValueOnce(Response.json({ sent: 2, expired: 0, remaining: 2 }));
    render(<Fixture />);
    send();
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("ネットワークエラーが発生しました"),
    );
    expect(mocks.success).not.toHaveBeenCalled();
    send();
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith("テスト通知を 2 件送信しました"),
    );
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("成功した送信と期限切れ整理の既存メッセージを保つ", async () => {
    mocks.apiFetch.mockResolvedValue(Response.json({ sent: 3, expired: 1, remaining: 2 }));
    render(<Fixture />);
    send();
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith("送信完了 (期限切れ 1 件を削除しました)"),
    );
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    {},
    { sent: "2", expired: 0, remaining: 2 },
    { sent: -1, expired: 0, remaining: 0 },
    { sent: 1.5, expired: 0, remaining: 1.5 },
    { sent: 1, expired: 2, remaining: 0 },
    { sent: 2, expired: 1, remaining: 2 },
  ])("不正な成功レスポンス %j から送信成功を作らない", async (data) => {
    mocks.apiFetch.mockResolvedValue(Response.json(data));
    render(<Fixture />);
    send();
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("通知の送信結果を確認できませんでした"),
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledOnce();
  });

  it("JSON を読めないレスポンスも送信成功にしない", async () => {
    mocks.apiFetch.mockResolvedValue(new Response("synthetic invalid JSON", { status: 200 }));
    render(<Fixture />);
    send();
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("通知の送信結果を確認できませんでした"),
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
