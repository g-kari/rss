export interface Feed {
  id: string;
  url: string;
  title: string;
  siteUrl: string;
  lastFetchedAt: string | null;
  fetchError: string | null;
}

export interface Article {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  link: string;
  summary: string;
  content?: string;
  ogImage?: string;
  publishedAt: string | null;
  createdAt: string;
}

export type Layout = 'compact' | 'list' | 'card' | 'magazine';
export type FontSize = 'small' | 'medium' | 'large';

export interface UserProfile {
  id: string;       // 0g0 内部ユーザーID
  sub: string;      // ペアワイズ識別子 (JWT sub)
  email: string;
  name: string;
  picture: string | null;
}

export interface Env {
  RSS_DATA: R2Bucket;
  AI: Ai;
  AUTH_BASE_URL: string;
  APP_BASE_URL: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  /** カンマ区切りの許可 sub リスト。空文字または未設定なら制限なし */
  BETA_ALLOWED_SUBS?: string;
}

