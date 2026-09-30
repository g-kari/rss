/** Explicit rollout gates. Missing or malformed values preserve legacy behavior. */
export interface FeedRolloutEnv {
  RSS_ARTICLE_STORAGE_V2?: string;
  RSS_ARTICLE_SEARCH_INDEX?: string;
}

function enabled(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function isArticleStorageV2Enabled(env: FeedRolloutEnv): boolean {
  return enabled(env.RSS_ARTICLE_STORAGE_V2);
}

export function isArticleSearchIndexEnabled(env: FeedRolloutEnv): boolean {
  return enabled(env.RSS_ARTICLE_SEARCH_INDEX);
}
