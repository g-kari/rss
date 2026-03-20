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

export interface UserProfile {
  id: string;       // 0g0 内部ユーザーID
  sub: string;      // ペアワイズ識別子 (JWT sub)
  email: string;
  name: string;
  picture: string | null;
}

export interface Env {
  RSS_DATA: R2Bucket;
  AUTH_BASE_URL: string;
  APP_BASE_URL: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
}

export type HonoEnv = {
  Bindings: Env;
  Variables: { userId: string };
};
