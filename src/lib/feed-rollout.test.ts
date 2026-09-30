import { describe, expect, it } from "vitest";
import { isArticleSearchIndexEnabled, isArticleStorageV2Enabled } from "./feed-rollout";

describe("article rollout gates", () => {
  it.each([undefined, "", "false", "FALSE", "1", "yes", "enabled", "truthy"])(
    "keeps legacy behavior for %s",
    (value) => {
      expect(isArticleStorageV2Enabled({ RSS_ARTICLE_STORAGE_V2: value })).toBe(false);
      expect(isArticleSearchIndexEnabled({ RSS_ARTICLE_SEARCH_INDEX: value })).toBe(false);
    },
  );
  it.each(["true", "TRUE", " true "])("accepts explicit %s", (value) => {
    expect(isArticleStorageV2Enabled({ RSS_ARTICLE_STORAGE_V2: value })).toBe(true);
    expect(isArticleSearchIndexEnabled({ RSS_ARTICLE_SEARCH_INDEX: value })).toBe(true);
  });
  it("keeps storage migration and indexed search independent", () => {
    expect(isArticleStorageV2Enabled({ RSS_ARTICLE_SEARCH_INDEX: "true" })).toBe(false);
    expect(isArticleSearchIndexEnabled({ RSS_ARTICLE_STORAGE_V2: "true" })).toBe(false);
  });
});
