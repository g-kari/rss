import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ComponentProps } from "react";
import { makeArticle } from "../../e2e/helpers/article";
import { TestReaderSettings } from "../../e2e/helpers/reader-settings";
import type { CacheEntry } from "../hooks/useImmersiveSummaryCache";
import type { CachedSummary, SummaryMetadata } from "../lib/ai-summary-contract";
import { STORAGE_KEYS } from "../lib/storage";
import ImmersiveSummaryReader from "./ImmersiveSummaryReader";
import QuickReadingSettings from "./QuickReadingSettings";

// Cache display must never initialize extraction or generation, even on retry.
const effects = vi.hoisted(() => ({
  fetch: vi.fn(),
  useArticleContent: vi.fn(),
  useArticleAi: vi.fn(),
  useAiOperation: vi.fn(),
  summarizeInBrowser: vi.fn(),
  prepareModel: vi.fn(),
  checkModel: vi.fn(),
}));
vi.mock("../hooks/useArticleContent", () => ({ useArticleContent: effects.useArticleContent }));
vi.mock("../hooks/useArticleAi", () => ({
  useArticleAi: effects.useArticleAi,
  useAiOperation: effects.useAiOperation,
}));
vi.mock("../lib/browser-summarizer", () => ({ summarizeInBrowser: effects.summarizeInBrowser }));

const model = "@cf/meta/llama-3.1-8b-instruct";
const article = makeArticle({ title: "保存済みの要約をここで読む記事" });
type ReaderProps = ComponentProps<typeof ImmersiveSummaryReader>;

function makeSummary(
  result = "## 保存済み要約\n\n記事の要点です。",
  metadata: Partial<SummaryMetadata> = {},
): CachedSummary {
  return {
    url: article.link,
    result,
    metadata: {
      version: 1,
      model,
      promptVersion: "summary-v1",
      bodyHash: "a".repeat(64),
      generatedAt: "2026-10-01T00:00:00Z",
      inputCharacters: 1200,
      inputTruncated: false,
      completeness: "unknown",
      usage: { inputTokens: 400, outputTokens: 80 },
      ...metadata,
    },
  };
}

function makeProps(overrides: Partial<ReaderProps> = {}): ReaderProps {
  return {
    article,
    model,
    entry: { kind: "hit", summary: makeSummary() },
    usingSummary: false,
    onClose: vi.fn(),
    onReadBody: vi.fn(),
    onUseSummary: vi.fn(),
    onUseExcerpt: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  effects.fetch.mockImplementation(() => {
    throw new Error("The saved-summary dialog must not send requests");
  });
  vi.stubGlobal("fetch", effects.fetch);
  vi.stubGlobal("Summarizer", {
    create: effects.prepareModel,
    availability: effects.checkModel,
  });
});

afterEach(() => {
  cleanup();
  for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("saved summary rendering", () => {
  it("renders Markdown and final text while preserving the cached result", () => {
    const summary = makeSummary(
      [
        "<think>内部の推論だけ。表示してはいけません。</think>",
        "## 要点",
        "",
        "**重要な結論**と`inline code`。",
        "",
        "- 通常の箇条書き",
        "- 次の要点",
        "",
        "・ 日本語の箇条書き",
        "・ 続く要点",
        "",
        "> 引用の要点",
        "",
        "```text",
        "sample code",
        "```",
      ].join("\n"),
    );
    const original = summary.result;
    const { container } = render(
      <ImmersiveSummaryReader {...makeProps({ entry: { kind: "hit", summary } })} />,
    );
    expect(screen.getByRole("dialog", { name: "保存済みのAI要約" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByRole("document")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "要点", level: 2 })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("重要な結論");
    expect(container.querySelector("code")).toHaveTextContent("inline code");
    expect(container.querySelector("pre code")).toHaveTextContent("sample code");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(container.querySelector("blockquote")).toHaveTextContent("引用の要点");
    expect(screen.queryByText(/内部の推論/)).toBeNull();
    expect(container.querySelector("think")).toBeNull();
    expect(summary.result).toBe(original);
    expect(screen.getByTestId("summary-availability")).toHaveTextContent("保存済みのAI要約");
    expect(screen.getByTestId("summary-source")).toHaveTextContent(
      "選択中のモデル: Llama 3.1 8B（バランス）",
    );
    expect(screen.getByText(/自動再生・読み上げを一時停止/)).toBeInTheDocument();
  });

  it("keeps raw HTML literal and removes image resources and unsafe navigation", () => {
    const summary = makeSummary(
      [
        '<script>alert("script payload")</script>',
        '<img src="https://example.com/tracker.png" onerror="bad()">',
        '<iframe src="https://example.com/embed"></iframe>',
        '<a href="javascript:alert(1)" onclick="bad()">raw HTML link</a>',
        "",
        "![説明用画像](https://example.com/remote.png)",
        "",
        "[安全なリンク](https://example.com/source?x=1&y=2)",
        "[HTTPリンク](http://example.com/source)",
        "[危険なリンク](javascript:alert%281%29)",
        "[データリンク](data:text/html,payload)",
        "[相対リンク](/api/ai/summarize)",
        "[プロトコル省略リンク](//example.com/source)",
        "[メールリンク](mailto:person@example.com)",
      ].join("\n"),
    );
    const { container } = render(
      <ImmersiveSummaryReader {...makeProps({ entry: { kind: "hit", summary } })} />,
    );
    expect(container.querySelector("script, img, iframe, [onerror], [onclick]")).toBeNull();
    const content = container.querySelector(".article-content");
    expect(content).toHaveTextContent('<script>alert("script payload")</script>');
    expect(content).toHaveTextContent("説明用画像");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    const safe = screen.getByRole("link", { name: "安全なリンク" });
    expect(safe).toHaveAttribute("href", "https://example.com/source?x=1&y=2");
    expect(safe).toHaveAttribute("target", "_blank");
    expect(safe).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "HTTPリンク" })).toHaveAttribute(
      "href",
      "http://example.com/source",
    );
    expect(screen.queryByRole("link", { name: "raw HTML link" })).toBeNull();
    expect(content).toHaveTextContent("HTML link");
    for (const name of [
      "危険なリンク",
      "データリンク",
      "相対リンク",
      "プロトコル省略リンク",
      "メールリンク",
    ]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
      expect(content).toHaveTextContent(name);
    }
  });

  it.each([
    "<think>まだ推論中",
    "</think>orphan close",
    "<think>outer <think>nested</think></think>answer",
    "&lt;think&gt;encoded private reasoning&lt;/think&gt;answer",
  ])("fails closed for ambiguous thinking text: %s", (result) => {
    const { container } = render(
      <ImmersiveSummaryReader
        {...makeProps({ entry: { kind: "hit", summary: makeSummary(result) } })}
      />,
    );
    expect(container.querySelector(".article-content")).toBeEmptyDOMElement();
    expect(screen.getByTestId("summary-availability")).toHaveTextContent("保存済みのAI要約");
  });

  it("labels nullable legacy metadata as unknown without inventing generation or full-body claims", () => {
    const summary = makeSummary(undefined, {
      promptVersion: null,
      bodyHash: null,
      generatedAt: null,
      inputCharacters: null,
      inputTruncated: null,
      usage: null,
    });
    render(<ImmersiveSummaryReader {...makeProps({ entry: { kind: "hit", summary } })} />);
    expect(
      screen.getByText("生成情報不明 · 入力の打ち切り有無不明 · 本文全体の取得状況不明"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/生成:|全文取得済み|本文全体を取得済み/)).toBeNull();
  });

  it.each(["promptVersion", "bodyHash", "generatedAt"] as const)(
    "does not imply complete generation provenance when %s is unknown",
    (field) => {
      render(
        <ImmersiveSummaryReader
          {...makeProps({
            entry: { kind: "hit", summary: makeSummary(undefined, { [field]: null }) },
          })}
        />,
      );
      expect(
        screen.getByText("生成情報不明 · 入力の打ち切りなし · 本文全体の取得状況不明"),
      ).toBeInTheDocument();
    },
  );

  it.each([
    { inputTruncated: true, completeness: "truncated", input: "入力は途中で打ち切り" },
    { inputTruncated: false, completeness: "unknown", input: "入力の打ち切りなし" },
  ] as const)(
    "reports input truncation $inputTruncated while keeping full-body availability unknown",
    ({ inputTruncated, completeness, input }) => {
      render(
        <ImmersiveSummaryReader
          {...makeProps({
            entry: {
              kind: "hit",
              summary: makeSummary(undefined, { inputTruncated, completeness }),
            },
          })}
        />,
      );
      expect(
        screen.getByText(`生成: 2026-10-01T00:00:00Z · ${input} · 本文全体の取得状況不明`),
      ).toBeInTheDocument();
    },
  );
});

const unavailableCases: { entry: CacheEntry; availability: string; canRetry: boolean }[] = [
  { entry: { kind: "idle" }, availability: "保存済み要約を確認中…", canRetry: false },
  { entry: { kind: "loading" }, availability: "保存済み要約を確認中…", canRetry: false },
  {
    entry: { kind: "miss" },
    availability: "選択中のモデルの保存済み要約はありません。読み込み済みの説明・抜粋を使えます。",
    canRetry: true,
  },
  {
    entry: { kind: "error", message: "private backend detail", status: 500 },
    availability: "保存済み要約を確認できませんでした。読み込み済みの説明・抜粋を使えます。",
    canRetry: true,
  },
  {
    entry: { kind: "evicted" },
    availability: "前に確認した要約は表示用メモリーから外れました。もう一度確認できます。",
    canRetry: true,
  },
  {
    entry: { kind: "disabled", reason: "ブラウザーAIでは保存済み要約を利用できません" },
    availability: "ブラウザーAIでは保存済み要約を利用できません",
    canRetry: false,
  },
];

describe("availability and cache-only controls", () => {
  it.each(unavailableCases)(
    "shows truthful $entry.kind availability and only valid controls",
    ({ entry, availability, canRetry }) => {
      const props = makeProps({ entry });
      const { container } = render(<ImmersiveSummaryReader {...props} />);
      const status = screen.getByTestId("summary-availability");
      expect(status).toHaveTextContent(availability);
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(container.querySelector(".article-content")).toBeNull();
      expect(screen.queryByText(/生成:|生成情報不明/)).toBeNull();
      expect(screen.queryByText("private backend detail")).toBeNull();
      expect(screen.queryByRole("button", { name: "ショートをAI要約にする" })).toBeNull();
      expect(screen.getByRole("button", { name: "ショートを説明にする" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "本文を読む" })).toBeEnabled();
      const retry = screen.queryByRole("button", { name: "保存済み要約を再確認" });
      if (canRetry) {
        expect(retry).toBeEnabled();
        expect(props.onRetry).not.toHaveBeenCalled();
        fireEvent.click(retry!);
        expect(props.onRetry).toHaveBeenCalledOnce();
        expect(props.onReadBody).not.toHaveBeenCalled();
        expect(props.onUseSummary).not.toHaveBeenCalled();
        expect(props.onUseExcerpt).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
      } else {
        expect(retry).toBeNull();
        expect(props.onRetry).not.toHaveBeenCalled();
      }
    },
  );

  it("forwards body, excerpt and summary source switches independently", () => {
    const props = makeProps();
    render(<ImmersiveSummaryReader {...props} />);
    expect(screen.queryByRole("button", { name: "保存済み要約を再確認" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ショートをAI要約にする" }));
    expect(props.onUseSummary).toHaveBeenCalledOnce();
    expect(props.onUseExcerpt).not.toHaveBeenCalled();
    expect(props.onReadBody).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ショートを説明にする" }));
    expect(props.onUseExcerpt).toHaveBeenCalledOnce();
    expect(props.onReadBody).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "本文を読む" }));
    expect(props.onReadBody).toHaveBeenCalledOnce();
    expect(props.onRetry).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ショート表示に戻る" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("disables the selected summary source while keeping body and excerpt choices usable", () => {
    const props = makeProps({ usingSummary: true });
    const { rerender } = render(<ImmersiveSummaryReader {...props} />);
    const chooseSummary = screen.getByRole("button", { name: "ショートをAI要約にする" });
    expect(chooseSummary).toBeDisabled();
    fireEvent.click(chooseSummary);
    expect(props.onUseSummary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ショートを説明にする" }));
    fireEvent.click(screen.getByRole("button", { name: "本文を読む" }));
    expect(props.onUseExcerpt).toHaveBeenCalledOnce();
    expect(props.onReadBody).toHaveBeenCalledOnce();
    rerender(<ImmersiveSummaryReader {...props} usingSummary={false} />);
    expect(chooseSummary).toBeEnabled();
    fireEvent.click(chooseSummary);
    expect(props.onUseSummary).toHaveBeenCalledOnce();
  });

  it("updates availability without stale cached text or provenance after losing a hit", () => {
    const props = makeProps({ entry: { kind: "idle" } });
    const { container, rerender } = render(<ImmersiveSummaryReader {...props} />);
    rerender(<ImmersiveSummaryReader {...props} entry={{ kind: "loading" }} />);
    expect(screen.getByTestId("summary-availability")).toHaveTextContent("確認中");
    rerender(
      <ImmersiveSummaryReader
        {...props}
        entry={{ kind: "hit", summary: makeSummary("**古い保存済み本文**") }}
      />,
    );
    expect(screen.getByText("古い保存済み本文")).toBeInTheDocument();
    for (const { entry, availability } of unavailableCases) {
      rerender(<ImmersiveSummaryReader {...props} entry={entry} />);
      expect(screen.getByTestId("summary-availability")).toHaveTextContent(availability);
      expect(screen.queryByText("古い保存済み本文")).toBeNull();
      expect(container.querySelector(".article-content")).toBeNull();
      expect(screen.queryByText(/生成:/)).toBeNull();
    }
    expect(props.onRetry).not.toHaveBeenCalled();
  });

  it("uses an explicit fallback when no model is configured", () => {
    render(
      <ImmersiveSummaryReader
        {...makeProps({
          model: undefined,
          entry: { kind: "disabled", reason: "AIモデルの設定待ちです" },
        })}
      />,
    );
    expect(screen.getByTestId("summary-source")).toHaveTextContent(
      "選択中のモデル: モデル設定なし",
    );
    expect(screen.getByTestId("summary-availability")).toHaveTextContent("AIモデルの設定待ちです");
  });
});

describe("dialog focus and shared reading settings", () => {
  it.each([false, true])(
    "focuses the title, traps Tab, isolates Escape and returns to its trigger (selected=%s)",
    (usingSummary) => {
      const outerKeyDown = vi.fn();
      const onClose = vi.fn();
      const props = makeProps({ usingSummary });
      function Harness() {
        const [open, setOpen] = useState(false);
        return (
          <div onKeyDown={outerKeyDown}>
            <button type="button" onClick={() => setOpen(true)}>
              保存済み要約を読む
            </button>
            {open && (
              <ImmersiveSummaryReader
                {...props}
                onClose={() => {
                  onClose();
                  setOpen(false);
                }}
              />
            )}
          </div>
        );
      }
      render(<Harness />);
      const trigger = screen.getByRole("button", { name: "保存済み要約を読む" });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: article.title })).toHaveFocus();
      const first = within(dialog).getByRole("button", { name: "ショート表示に戻る" });
      const last = within(dialog).getByRole("button", { name: "本文を読む" });
      last.focus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(first).toHaveFocus();
      fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
      expect(last).toHaveFocus();
      fireEvent.keyDown(last, { key: "ArrowRight" });
      expect(outerKeyDown).not.toHaveBeenCalled();
      fireEvent.keyDown(last, { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
      expect(outerKeyDown).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
    },
  );

  it("uses readable standalone settings without a provider", () => {
    const { container } = render(<ImmersiveSummaryReader {...makeProps()} />);
    const content = container.querySelector(".article-content");
    expect(content).toHaveClass("text-[16px]", "font-sans");
    expect(content).toHaveStyle({ lineHeight: "1.9" });
    expect(content?.parentElement).toHaveStyle({ maxWidth: "720px" });
  });

  it("shares persisted settings and live changes without replacing content or resetting reader scroll", () => {
    const props = makeProps();
    localStorage.setItem(STORAGE_KEYS.FONT_SIZE, "small");
    localStorage.setItem(STORAGE_KEYS.FONT_FAMILY, "mono");
    localStorage.setItem(STORAGE_KEYS.LINE_HEIGHT, "tight");
    localStorage.setItem(STORAGE_KEYS.CONTENT_WIDTH, "narrow");
    const { container } = render(
      <TestReaderSettings>
        <QuickReadingSettings />
        <ImmersiveSummaryReader {...props} />
      </TestReaderSettings>,
    );
    const content = container.querySelector(".article-content");
    const documentView = screen.getByRole("document");
    expect(content).toHaveClass("text-[14px]", "font-mono");
    expect(content).toHaveStyle({ lineHeight: "1.5" });
    expect(content?.parentElement).toHaveStyle({ maxWidth: "640px" });
    documentView.scrollTop = 80;
    const settingsTrigger = screen.getByRole("button", { name: "読書設定" });
    fireEvent.click(settingsTrigger);
    for (const [label, value] of [
      ["文字サイズ", "large"],
      ["フォント", "serif"],
      ["行間", "loose"],
      ["本文の幅", "wide"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    expect(container.querySelector(".article-content")).toBe(content);
    expect(screen.getByRole("document")).toBe(documentView);
    expect(content).toHaveClass("text-[19px]", "font-serif");
    expect(content).toHaveStyle({ lineHeight: "2.3" });
    expect(content?.parentElement).toHaveStyle({ maxWidth: "900px" });
    expect(documentView.scrollTop).toBe(80);
    expect(localStorage.getItem(STORAGE_KEYS.FONT_SIZE)).toBe("large");
    expect(localStorage.getItem(STORAGE_KEYS.FONT_FAMILY)).toBe("serif");
    expect(localStorage.getItem(STORAGE_KEYS.LINE_HEIGHT)).toBe("loose");
    expect(localStorage.getItem(STORAGE_KEYS.CONTENT_WIDTH)).toBe("wide");
    fireEvent.keyDown(screen.getByLabelText("文字サイズ"), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "読書設定" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "保存済みのAI要約" })).toBeInTheDocument();
    expect(settingsTrigger).toHaveFocus();
    expect(documentView.scrollTop).toBe(80);
    for (const callback of [
      props.onClose,
      props.onReadBody,
      props.onUseSummary,
      props.onUseExcerpt,
      props.onRetry,
    ]) {
      expect(callback).not.toHaveBeenCalled();
    }
  });
});
