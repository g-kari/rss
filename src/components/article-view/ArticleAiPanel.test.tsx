import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../../e2e/helpers/article";
import ArticleAiPanel from "./ArticleAiPanel";
import { apiFetch } from "../../lib/api-fetch";
import { aiResultCacheKey } from "../../lib/ai-preferences";
import { LruCache } from "../../lib/lru-cache";
import { useAiOperation } from "../../hooks/useArticleAi";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn() }));

const props = {
  article: makeArticle(),
  aiError: null,
  summaryRating: null,
  setSummaryRating: vi.fn(),
};
const summary =
  "## 概要\n\n**重要なポイント**\n\n* **参加者:** じんさん\n* 会場は VRChat\n\n1. 開催\n2. 振り返り\n\n[記事を読む](https://example.com/article?q=1&lang=ja)";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ArticleAiPanel Markdown", () => {
  it.each(["browser", "workers-ai"] as const)("%s の要約を同じ Markdown で表示する", (provider) => {
    const { container } = render(
      <ArticleAiPanel {...props} aiResult={summary} aiResultProvider={provider} />,
    );
    expect(screen.getByRole("heading", { name: "概要" })).toBeInTheDocument();
    expect(screen.getByText("重要なポイント").tagName).toBe("STRONG");
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    const link = screen.getByRole("link", { name: "記事を読む" });
    expect(link).toHaveAttribute("href", "https://example.com/article?q=1&lang=ja");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByText(provider === "browser" ? "Chrome 要約" : "Workers AI"),
    ).toBeInTheDocument();
  });

  it("途中の Markdown を安全に表示し、完了時に再描画する", () => {
    const { container, rerender } = render(
      <ArticleAiPanel {...props} aiResult={"## 概要\n\n**途中"} />,
    );
    expect(screen.getByRole("heading", { name: "概要" })).toBeInTheDocument();
    expect(container).toHaveTextContent("**途中");
    rerender(
      <ArticleAiPanel
        {...props}
        aiResult={"## 概要\n\n**途中から完成**\n\n- [リンク](https://example.com)"}
      />,
    );
    expect(screen.getByText("途中から完成").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "リンク" })).toBeInTheDocument();
    rerender(<ArticleAiPanel {...props} aiResult={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("旧形式のプレーンテキスト・改行・和文箇条書きを保持する", () => {
    const { container } = render(
      <ArticleAiPanel
        {...props}
        aiResult={"普通の要約\n次の行\n\n・ **要点 A**\n• 要点 B\n\n終わり"}
      />,
    );
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(screen.getByText("要点 A").tagName).toBe("STRONG");
    expect(container).toHaveTextContent("終わり");
  });

  it("HTML・埋め込み・画像を実行せず危険な URL をリンクにしない", () => {
    const { container } = render(
      <ArticleAiPanel
        {...props}
        aiResult={[
          '<script>alert(1)</script><img src="x" onerror="alert(1)">',
          '<iframe src="https://www.youtube.com/embed/fake"></iframe>',
          '<svg onload="alert(1)"><a href="javascript:alert(1)">危険</a></svg>',
          "[危険リンク](javascript:alert%281%29) [data](data:text/html,test) [entity](jav&#x61;script:alert%281%29)",
          "[相対パス](/api/ai/summarize) [プロトコル相対](//example.com)",
          "![画像の説明](https://example.com/tracker.png)",
        ].join("\n\n")}
      />,
    );
    expect(container.querySelector("script, img, iframe, svg, style, input")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("<script>alert(1)</script>");
    expect(container).toHaveTextContent("画像の説明");
  });

  it("コード内の Markdown・HTML・和文箇条書きと数式の文字列は変更しない", () => {
    const { container } = render(
      <ArticleAiPanel
        {...props}
        aiResult={'`**literal**`\n\n```html\n・ code\n<img src="x">\n```\n\n$x^2$'}
      />,
    );
    expect(container.querySelector("pre code")?.textContent).toBe('・ code\n<img src="x">\n');
    expect(container.querySelector("code")?.textContent).toBe("**literal**");
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("$x^2$");
  });

  it.each([undefined, 12, {}, ["text"]])("不正な旧データ %j でもクラッシュしない", (value) => {
    const { container } = render(<ArticleAiPanel {...props} aiResult={value as string} />);
    expect(container.querySelector(".ai-summary-content")?.textContent ?? "").toBe("");
  });

  it("評価・エラー・再試行の既存操作を維持する", () => {
    const onEngagement = vi.fn();
    const onRetry = vi.fn();
    render(
      <ArticleAiPanel
        {...props}
        aiResult={summary}
        onEngagement={onEngagement}
        onRetry={onRetry}
        aiError={{ type: "unknown", message: "再試行できるエラー" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "要約の評価: 良い" }));
    expect(props.setSummaryRating).toHaveBeenCalledWith("good");
    expect(onEngagement).toHaveBeenCalledWith(
      props.article.id,
      props.article.feedHash,
      "ai_feedback",
      "good:summary",
    );
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("AI operation → Markdown display", () => {
  it.each(["browser", "workers-ai"] as const)(
    "%s の生成結果とキャッシュ再読込を同じように描画する",
    async (provider) => {
      const cache = new LruCache(`markdown-${provider}`, 10);
      const preferences = {
        provider,
        model: "@cf/meta/llama-3.1-8b-instruct" as const,
        userId: "test-user",
      };
      const local = vi.fn(async () => ({
        text: summary,
        isHtml: false,
        provider: "browser" as const,
      }));
      vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ result: summary })));
      const { result } = renderHook(() =>
        useAiOperation("/api/ai/summarize", cache, "失敗", local, preferences),
      );
      await act(async () =>
        result.current.run(props.article.link, props.article.id, "article content"),
      );
      const view = render(
        <ArticleAiPanel
          {...props}
          aiResult={result.current.result?.text ?? null}
          aiResultProvider={result.current.result?.provider}
        />,
      );
      expect(screen.getByRole("heading", { name: "概要" })).toBeInTheDocument();
      expect(screen.getByText("重要なポイント").tagName).toBe("STRONG");
      act(() => result.current.reset());
      await act(async () =>
        result.current.run(props.article.link, props.article.id, "article content"),
      );
      view.rerender(
        <ArticleAiPanel
          {...props}
          aiResult={result.current.result?.text ?? null}
          aiResultProvider={result.current.result?.provider}
        />,
      );
      expect(screen.getByRole("heading", { name: "概要" })).toBeInTheDocument();
      expect(screen.getByText("重要なポイント").tagName).toBe("STRONG");
      expect(local).toHaveBeenCalledTimes(provider === "browser" ? 1 : 0);
      expect(apiFetch).toHaveBeenCalledTimes(provider === "workers-ai" ? 1 : 0);
      expect(
        JSON.parse(cache.get(aiResultCacheKey(preferences, props.article.id, props.article.link))!)
          .text,
      ).toBe(summary);
    },
  );

  it("旧プレーンテキストキャッシュを再生成せず描画する", async () => {
    const cache = new LruCache("markdown-legacy", 10);
    const preferences = {
      provider: "auto" as const,
      model: "@cf/meta/llama-3.1-8b-instruct" as const,
      userId: "test-user",
    };
    const text = "旧形式の本文\n次の行\n\n・ 要点";
    cache.set(aiResultCacheKey(preferences, props.article.id, props.article.link), text);
    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", cache, "失敗", undefined, preferences),
    );
    await act(async () => result.current.run(props.article.link, props.article.id));
    const { container } = render(
      <ArticleAiPanel {...props} aiResult={result.current.result?.text ?? null} />,
    );
    expect(container).toHaveTextContent("旧形式の本文");
    expect(container.querySelector("br")).not.toBeNull();
    expect(screen.getByRole("listitem")).toHaveTextContent("要点");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
