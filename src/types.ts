export interface Feed {
  id: string;
  url: string;
  title: string;
  siteUrl: string;
  lastFetchedAt: string | null;
}

export interface Article {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
}
