import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AiNotificationTabPanel from "./AiNotificationTabPanel";
import { DEFAULT_AI_MODEL } from "../../lib/ai-models";
import type { AiProviderPreference } from "../../lib/ai-preferences";

vi.mock("../../lib/browser-translator", () => ({
  diagnoseTranslatorAvailability: vi.fn(async () => ({ available: false, reason: "not-chromium" })),
}));
vi.mock("../../lib/browser-summarizer", () => ({
  diagnoseSummarizerAvailability: vi.fn(async () => ({ available: false, reason: "not-chromium" })),
}));
vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn(async () => new Response("{}")) }));

import { diagnoseTranslatorAvailability } from "../../lib/browser-translator";
import { diagnoseSummarizerAvailability } from "../../lib/browser-summarizer";

function props(provider: AiProviderPreference = "auto") {
  return {
    userId: "user-a",
    hidden: false,
    autoTranslate: false,
    toggleAutoTranslate: vi.fn(),
    autoSummarize: false,
    toggleAutoSummarize: vi.fn(),
    autoAiBrowserOnly: true,
    toggleAutoAiBrowserOnly: vi.fn(),
    aiProvider: provider,
    onChangeAiProvider: vi.fn(),
    aiModel: DEFAULT_AI_MODEL,
    onChangeAiModel: vi.fn(),
  };
}

describe("AI source settings UI", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Auto・Chrome・クラウドを選べてクラウド時は Chrome の診断も行わない", () => {
    const values = props("workers-ai");
    render(<AiNotificationTabPanel {...values} />);
    const select = screen.getByRole("combobox", { name: "AI の実行先" });
    expect(select).toHaveValue("workers-ai");
    expect(screen.getByRole("option", { name: "自動（Chrome 優先）" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Chrome 内蔵 AI のみ" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Workers AI モデル" })).toBeEnabled();
    expect(screen.getByText(/Chrome 内蔵 AI は使用しません/)).toBeInTheDocument();
    expect(diagnoseTranslatorAvailability).not.toHaveBeenCalled();
    expect(diagnoseSummarizerAvailability).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: "browser" } });
    expect(values.onChangeAiProvider).toHaveBeenCalledWith("browser");
  });

  it("Chrome 限定時はモデル選択を無効化し、クラウドに送らないことを表示する", () => {
    render(<AiNotificationTabPanel {...props("browser")} />);
    expect(screen.getByRole("combobox", { name: "Workers AI モデル" })).toBeDisabled();
    expect(screen.getByText(/クラウドには送信しません/)).toBeInTheDocument();
    expect(screen.queryByText("自動処理は端末のみ")).not.toBeInTheDocument();
  });
});

afterEach(cleanup);
