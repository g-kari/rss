export interface Feed {
  id: string;
  url: string;
  title: string;
  siteUrl: string;
  lastFetchedAt: string | null;
  fetchError: string | null;
  /** 連続フェッチ失敗回数。成功時にリセット。クロンでの再試行抑制に使用 */
  consecutiveErrors?: number;
  /** 最後にフェッチが失敗した日時（ISO 8601）。自動回復の判定に使用 */
  lastErrorAt?: string | null;
  /** 429 レートリミット解除予定時刻（ISO 8601）。この時刻までクロン取得をスキップ */
  rateLimitedUntil?: string | null;
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
  author?: string;
  publishedAt: string | null;
  createdAt: string;
}

export type Layout = 'compact' | 'list' | 'card' | 'magazine';
export type FontSize = 'small' | 'medium' | 'large';
export type DateRange = 'all' | 'today' | 'week' | 'month';
export type AiMode = 'summary' | 'translation';

export interface UserProfile {
  id: string;       // 0g0 内部ユーザーID
  sub: string;      // ペアワイズ識別子 (JWT sub)
  email: string;
  name: string;
  picture: string | null;
}

/** Web Push サブスクリプション（PushSubscription.toJSON() の表現） */
export interface PushSubscriptionRecord {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string; // base64url — ユーザーエージェントの公開鍵 (65 bytes uncompressed P-256)
    auth: string;   // base64url — 認証シークレット (16 bytes)
  };
}

/** R2 に保存するユーザーの Push 通知設定 */
export interface PushConfig {
  subscriptions: PushSubscriptionRecord[];
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

