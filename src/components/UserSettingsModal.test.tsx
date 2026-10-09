import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import UserSettingsModal from "./UserSettingsModal";
import { SETTINGS_CATALOG, SETTINGS_CATEGORIES } from "./user-settings/settings-catalog";
import { ReaderSettingsProvider, type ReaderSettings } from "../contexts/ReaderSettingsContext";
import { apiFetch } from "../lib/api-fetch";
import { useTtsAdapter } from "../contexts/TtsAdapterContext";
vi.mock("../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("../lib/browser-translator", () => ({
  diagnoseTranslatorAvailability: vi.fn(async () => ({ available: false, reason: null })),
}));
vi.mock("../lib/browser-summarizer", () => ({
  diagnoseSummarizerAvailability: vi.fn(async () => ({ available: false, reason: null })),
}));
vi.mock("../contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../contexts/VisualModeContext", () => ({
  useVisualMode: () => ({ mode: "standard", setMode: vi.fn(), disableOnboarding: vi.fn() }),
}));
vi.mock("../contexts/TtsAdapterContext", () => ({ useTtsAdapter: vi.fn() }));
vi.mock("../hooks/useFullTextSearch", () => ({
  useFullTextSearch: () => ({ savedSearches: [], importSaved: vi.fn() }),
}));
const noop = vi.fn();
const settings: ReaderSettings = {
  fontSize: "medium",
  onChangeFontSize: vi.fn(),
  fontFamily: "sans",
  onChangeFontFamily: vi.fn(),
  theme: "light",
  setTheme: vi.fn(),
  focusMode: false,
  toggleFocusMode: noop,
  autoReadEnabled: true,
  toggleAutoRead: vi.fn(),
  autoReadThreshold: 90,
  cycleAutoReadThreshold: noop,
  onChangeAutoReadThreshold: vi.fn(),
  autoTranslate: false,
  toggleAutoTranslate: vi.fn(),
  autoSummarize: false,
  toggleAutoSummarize: vi.fn(),
  autoAiBrowserOnly: false,
  toggleAutoAiBrowserOnly: vi.fn(),
  lineHeight: "normal",
  onChangeLineHeight: vi.fn(),
  contentWidth: "medium",
  onChangeContentWidth: vi.fn(),
  textJustify: false,
  onChangeTextJustify: vi.fn(),
  galleryColumns: "auto",
  onChangeGalleryColumns: vi.fn(),
  galleryColumnsFocus: "auto",
  onChangeGalleryColumnsFocus: vi.fn(),
  galleryCardSize: "medium",
  onChangeGalleryCardSize: vi.fn(),
  galleryMinImagePx: 0,
  onChangeGalleryMinImagePx: vi.fn(),
  galleryAutoScrollSpeed: "off",
  onChangeGalleryAutoScrollSpeed: vi.fn(),
  galleryPageSize: 50,
  onChangeGalleryPageSize: vi.fn(),
  deduplicateByLink: false,
  toggleDeduplicateByLink: vi.fn(),
  ttlDays: null,
  onChangeTtlDays: vi.fn(),
  imageDlFolder: "",
  onChangeImageDlFolder: vi.fn(),
  imageDlFolderNsfw: "",
  onChangeImageDlFolderNsfw: vi.fn(),
  aiProvider: "auto",
  onChangeAiProvider: vi.fn(),
  aiUserId: "one",
  aiModel: "@cf/meta/llama-3.1-8b-instruct",
  onChangeAiModel: vi.fn(),
};
const props = {
  userId: "one",
  onClose: vi.fn(),
  feeds: [],
  articles: [],
  notes: {},
  setNote: vi.fn(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  toggleBookmark: vi.fn(),
  toggleReadingList: vi.fn(),
  collections: [],
  addArticlesToCollection: vi.fn(async () => {}),
};
const request = vi.mocked(apiFetch);
function view(userId = "one", value = settings) {
  return (
    <ReaderSettingsProvider value={value}>
      <UserSettingsModal {...props} userId={userId} />
    </ReaderSettingsProvider>
  );
}
async function open() {
  const result = render(view());
  await act(async () => {});
  return result;
}
function search(value: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "設定を検索" }), { target: { value } });
}
function selectSetting(id: string) {
  const setting = SETTINGS_CATALOG.find((item) => item.id === id)!;
  search(setting.label);
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(`^${setting.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("PushManager", function PushManager() {});
  Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(useTtsAdapter).mockReturnValue({
    engine: "web-speech",
    supported: true,
    isPlaying: false,
    isPaused: false,
    endedCount: 0,
    errorCount: 0,
    lastError: null,
    rate: 1,
    cycleRate: vi.fn(() => 1),
    speak: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    voices: [],
    voiceUri: null,
    setVoiceUri: vi.fn(),
    volume: 1,
    setVolume: vi.fn(),
    setEngine: vi.fn(),
    availableEngines: ["web-speech", "piper"],
  });
  request.mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          url === "/api/push/config"
            ? {
                silentStart: "22:00",
                silentEnd: "07:00",
                timezone: "UTC",
                recommendationEnabled: true,
                recommendationTime: "18:30",
                errorNotificationsEnabled: true,
              }
            : {},
        ),
      ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("purpose-based settings navigation", () => {
  it("keeps every catalog setting mounted exactly once with only one category visible", async () => {
    await open();
    const dialog = screen.getByRole("dialog");
    for (const setting of SETTINGS_CATALOG)
      expect(
        dialog.querySelectorAll(setting.selector ?? `[data-setting-id="${setting.id}"]`),
      ).toHaveLength(1);
    for (const row of dialog.querySelectorAll("[data-settings-row]"))
      expect(row).toHaveAttribute("data-setting-id");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getAllByRole("tab")).toHaveLength(SETTINGS_CATEGORIES.length);
    expect(dialog.querySelectorAll('input[type="checkbox"]')).toHaveLength(7);
  });
  it("uses label/alias search to focus the existing control without changing any value", async () => {
    await open();
    const font = screen.getByRole("radiogroup", { name: "フォントサイズ" });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    writes.mockClear();
    search("　文字　大きさ　");
    fireEvent.click(screen.getByRole("button", { name: "フォントサイズ 読書・表示" }));
    expect(font.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toHaveAttribute("tabindex", "0");
    selectSetting("retention");
    expect(
      screen.getByRole("radiogroup", { name: "記事保持期間" }).contains(document.activeElement),
    ).toBe(true);
    expect(screen.getByRole("radio", { name: "30日" })).toHaveAttribute("aria-checked", "true");
    expect(writes).not.toHaveBeenCalled();
    for (const value of Object.values(settings))
      if (typeof value === "function") expect(value).not.toHaveBeenCalled();
    expect(
      request.mock.calls.every(([, options]) => !options?.method || options.method === "GET"),
    ).toBe(true);
    writes.mockRestore();
  });
  it("does not switch category while typing, handles zero results/clear, and navigates without remounting", async () => {
    await open();
    const original = screen.getByRole("radiogroup", { name: "フォントサイズ" });
    search("SingleFile");
    expect(screen.getByRole("tab", { name: "読書・表示" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(request).toHaveBeenCalledTimes(1);
    search("存在しない設定xyz");
    expect(screen.getByRole("status")).toHaveTextContent("一致する設定がありません");
    fireEvent.click(screen.getByRole("button", { name: "設定検索をクリア" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
    const scrollBody = screen.getByRole("dialog").lastElementChild as HTMLElement;
    scrollBody.scrollTop = 240;
    fireEvent.click(screen.getByRole("tab", { name: "ギャラリー" }));
    expect(scrollBody.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole("tab", { name: "読書・表示" }));
    expect(screen.getByRole("radiogroup", { name: "フォントサイズ" })).toBe(original);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("retains radio callbacks and TTL null versus zero semantics", async () => {
    await open();
    selectSetting("retention");
    fireEvent.click(screen.getByRole("radio", { name: "無制限" }));
    expect(settings.onChangeTtlDays).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("radio", { name: "30日" }));
    expect(settings.onChangeTtlDays).toHaveBeenLastCalledWith(null);
    selectSetting("font-size");
    fireEvent.click(screen.getByRole("radio", { name: "大" }));
    expect(settings.onChangeFontSize).toHaveBeenCalledWith("large");
  });
  it("retains tab roving focus and provides a safe notice for unavailable conditional settings", async () => {
    render(view("one", { ...settings, autoReadEnabled: false }));
    await act(async () => {});
    const tabs = screen.getByRole("tablist");
    fireEvent.keyDown(tabs, { key: "End" });
    expect(screen.getByRole("tab", { name: "バックアップ・連携" })).toHaveFocus();
    fireEvent.keyDown(tabs, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "読書・表示" })).toHaveFocus();
    selectSetting("auto-read-threshold");
    expect(screen.getByRole("tabpanel")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("現在の設定やこのブラウザ");
    expect(settings.toggleAutoRead).not.toHaveBeenCalled();
  });
  it("explains a disabled search target without enabling or changing it", async () => {
    render(view("one", { ...settings, aiProvider: "browser" }));
    await act(async () => {});
    selectSetting("ai-model");
    expect(screen.getByRole("combobox", { name: "Workers AI モデル" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("現在の設定やこのブラウザ");
    expect(document.activeElement).toHaveAttribute("data-setting-id", "ai-model");
    expect(settings.onChangeAiProvider).not.toHaveBeenCalled();
  });
  it("returns from an unavailable empty panel to visible controls on Tab", async () => {
    vi.mocked(useTtsAdapter).mockReturnValue({
      ...useTtsAdapter(),
      supported: false,
      setEngine: undefined,
      availableEngines: ["web-speech"],
    });
    await open();
    selectSetting("tts-voice");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveFocus();
    fireEvent.keyDown(panel, { key: "Tab" });
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  });
  it("lets a nested preset dialog own Tab and Escape without closing its parent", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "現在の設定を保存" }));
    const input = screen.getByRole("textbox", { name: "プリセットを保存" });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: /^保存$/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: /^保存$/ }), { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "ユーザー設定" })).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it("discards a late previous-account configuration without navigation-induced writes", async () => {
    let resolveFirst!: (response: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const result = render(view("one"));
    result.rerender(view("two"));
    await act(async () => {});
    await act(async () => {
      resolveFirst(
        new Response(
          JSON.stringify({ silentStart: "11:00", silentEnd: "12:00", timezone: "Asia/Tokyo" }),
        ),
      );
    });
    fireEvent.click(screen.getByRole("tab", { name: "通知" }));
    expect(screen.getByLabelText("サイレント時間帯 開始時刻")).toHaveValue("22:00");
    expect(screen.getByLabelText("Push 通知 タイムゾーン")).toHaveValue("UTC");
    expect(
      request.mock.calls.every(([, options]) => !options?.method || options.method === "GET"),
    ).toBe(true);
  });
});

it("NSFW状態の検索は読書tabpanel内へ移動し、通常表示を利用不能と誤表示しない", async () => {
  await open();
  selectSetting("nsfw-mode");
  const group = screen.getByRole("group", { name: "NSFW表示設定" });
  expect(group).toHaveFocus();
  expect(group.closest('[role="tabpanel"]')).toHaveAttribute("id", "panel-reading");
  expect(group).toHaveTextContent("通常表示中");
  expect(screen.queryByText(/現在の設定やこのブラウザの対応状況によって利用できません/)).toBeNull();
  expect(screen.queryByRole("button", { name: "NSFWモード解除" })).toBeNull();
});
