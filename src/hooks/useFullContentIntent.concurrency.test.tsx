import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useArticleContent } from "./useArticleContent";
import { useFullContentIntent } from "./useFullContentIntent";
import AutoReadController from "../components/article-view/AutoReadController";
import { makeArticle } from "../../e2e/helpers/article";
const fetch = vi.hoisted(() => vi.fn(() => new Promise<Response>(() => {})));
vi.mock("../lib/api-fetch", () => ({ apiFetch: fetch }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ info: vi.fn() }) }));
const article = makeArticle({ id: "one-shot-concurrent-fetch", content: "" });
afterEach(cleanup);
it("does not abort/restart an automatic request that starts earlier in the same effect flush", () => {
  function Harness() {
    const state = useArticleContent(article.id, article.link, "https://example.com/og.jpg");
    useFullContentIntent(
      article,
      { requestId: 1, articleId: article.id, link: article.link, target: "pane" },
      "pane",
      !!state.storedContent,
      true,
      state.fetching,
      state.fetchFullContentOnce,
      () => true,
    );
    return (
      <AutoReadController
        enabled
        article={article}
        ttsSupported
        ttsPlaying={false}
        ttsPaused={false}
        ttsEndedCount={0}
        fetching={state.fetching}
        fetchError={state.fetchError}
        hasFullContent={false}
        canFetch
        ttsText="本文"
        autoTranslatePending={false}
        autoSummarizePending={false}
        onSpeak={() => {}}
        onTtsStop={() => {}}
        onFetch={state.fetchFullContent}
        hasNext={false}
        onAutoModeStop={() => {}}
      />
    );
  }
  render(<Harness />);
  expect(fetch).toHaveBeenCalledOnce();
});
