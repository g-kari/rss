/** 共有フィードメタデータ — feeds/{feedHash}/meta.json に保存 */
export interface SharedFeedMeta {
  feedHash: string;           // sha256Hex(url).slice(0, 16)
  url: string;                // RSS フィード URL
  title: string;              // RSS XML から取得
  siteUrl: string;            // RSS XML から取得
  lastFetchedAt: string | null;
  fetchError: string | null;
  consecutiveErrors?: number;
  lastErrorAt?: string | null;
  /** 429 レートリミット解除予定時刻（ISO 8601） */
  rateLimitedUntil?: string | null;
  /** 条件付きリクエスト用 Last-Modified */
  lastModified?: string | null;
  /** 条件付きリクエスト用 ETag */
  etag?: string | null;
  /** 記事の総件数（近似値） */
  articleCount: number;
  /** latest.json 以外のページファイル数 (p2, p3, ...) */
  pageCount: number;
}

/** ユーザーの購読情報 — users/{userId}/subscriptions.json の要素 */
export interface UserSubscription {
  feedHash: string;       // SharedFeedMeta を参照
  url: string;            // 表示・重複チェック用
  customTitle?: string;   // ユーザーが設定したタイトル上書き
  subscribedAt: string;   // ISO 8601
}

/** クライアント向けフィード型（SharedFeedMeta + UserSubscription を合成して返す） */
export interface Feed {
  id: string;                   // = feedHash
  url: string;
  title: string;                // customTitle ?? meta.title
  siteUrl: string;
  lastFetchedAt: string | null;
  fetchError: string | null;
  /** 連続フェッチ失敗回数 */
  consecutiveErrors?: number;
  lastErrorAt?: string | null;
  rateLimitedUntil?: string | null;
}

export interface Article {
  id: string;               // sha256Hex(feedUrl + "|" + guid).slice(0, 16) — 決定論的
  feedHash: string;         // SharedFeedMeta.feedHash を参照（旧 feedId）
  guid: string;             // RSS XML 由来（サーバー側 dedup 専用）
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
