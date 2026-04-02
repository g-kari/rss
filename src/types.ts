/** /api/ogp レスポンス — OGP メタ情報 */
export interface OgpData {
  image: string;
  title: string;
  description: string;
}

/** LLM が推論した CSS セレクタ設定（RSS 未対応サイト用） */
export interface SelectorConfig {
  /** 記事 <a> タグの CSS セレクタ */
  articleLink: string;
  /** 記事タイトル要素のセレクタ（省略時はリンクテキストを使用） */
  articleTitle?: string;
  /** 日付要素のセレクタ */
  articleDate?: string;
  /** 推論に使用したモデル */
  model: string;
  /** セレクタ生成日時（ISO 8601） */
  generatedAt: string;
}

/** 共有フィードメタデータ — feeds/{feedHash}/meta.json に保存 */
export interface SharedFeedMeta {
  feedHash: string; // sha256Hex(url).slice(0, 16)
  url: string; // RSS フィード URL（LLM 生成フィードの場合はサイト URL）
  title: string; // RSS XML から取得
  siteUrl: string; // RSS XML から取得
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
  /** 全ページを通じて既知の記事 ID 一覧（重複チェック用、最大 10,000 件） */
  knownIds?: string[];
  /** LLM が推論した CSS セレクタ設定（RSS 未対応サイト用） */
  cssSelectors?: SelectorConfig;
  /** 過去に試して失敗した articleLink セレクタの履歴（再推論時の除外用） */
  failedSelectors?: string[];
}

/** フィードごとのキーワードフィルター */
export interface KeywordFilter {
  /** 含むキーワード (OR: いずれかにマッチで通過。空 = フィルタなし) */
  include: string[];
  /** 除外キーワード (OR: いずれかにマッチで除外。空 = フィルタなし) */
  exclude: string[];
  /** RSS <category> タグも対象にするか */
  matchCategories?: boolean;
}

/** ユーザーの購読情報 — users/{userId}/subscriptions.json の要素 */
export interface UserSubscription {
  feedHash: string; // SharedFeedMeta を参照
  url: string; // 表示・重複チェック用
  customTitle?: string; // ユーザーが設定したタイトル上書き
  subscribedAt: string; // ISO 8601
  filter?: KeywordFilter;
  /** NSFW フラグ — true のとき NSFW モードでのみ記事を表示 */
  nsfw?: boolean;
  /** フェッチ時に付与する Cookie ヘッダー値（年齢確認ゲート等の突破に使用） */
  requestCookie?: string;
  /** 優先度 — "high" のとき高優先度（スター付き）フィードとして扱う */
  priority?: "high";
}

/** クライアント向けフィード型（SharedFeedMeta + UserSubscription を合成して返す） */
export interface Feed {
  id: string; // = feedHash
  url: string;
  title: string; // customTitle ?? meta.title
  siteUrl: string;
  lastFetchedAt: string | null;
  fetchError: string | null;
  /** 連続フェッチ失敗回数 */
  consecutiveErrors?: number;
  lastErrorAt?: string | null;
  rateLimitedUntil?: string | null;
  /** p2.json 以降のページ数（0 = latest.json のみ、1 以上なら過去記事あり） */
  pageCount?: number;
  filter?: KeywordFilter;
  /** NSFW フラグ — true のとき NSFW モードでのみ記事を表示 */
  nsfw?: boolean;
  /** 優先度 — "high" のとき高優先度（スター付き）フィードとして扱う */
  priority?: "high";
  /** LLM で CSS セレクタを推論したスクレイピングフィードか */
  isScraping?: boolean;
  /** 現在使用中の CSS セレクタ（isScraping のみ） */
  cssSelector?: string;
  /** 過去に失敗した CSS セレクタの履歴 */
  failedSelectors?: string[];
}

export interface Article {
  id: string; // sha256Hex(feedUrl + "|" + guid).slice(0, 16) — 決定論的
  feedHash: string; // SharedFeedMeta.feedHash を参照（旧 feedId）
  guid: string; // RSS XML 由来（サーバー側 dedup 専用）
  title: string;
  link: string;
  summary: string;
  content?: string;
  ogImage?: string;
  author?: string;
  publishedAt: string | null;
  createdAt: string;
  categories?: string[];
  /** RSS フィード固有の追加フィールド値（dc:corp, business_form 等） */
  metadata?: Array<{ key: string; value: string }>;
}

export type Layout = "compact" | "list" | "card" | "magazine";
export type FontSize = "small" | "medium" | "large";
export type SortOrder = "newest" | "oldest";

/** 記事に対するユーザーアクション種別 */
export type EngagementAction =
  | "fetch_full" // 全文取得
  | "open_original" // 元記事に遷移
  | "reading_list" // 後で読むに追加
  | "bookmark" // ブックマーク
  | "like"; // いいね

/** エンゲージメントの1イベント */
export interface EngagementEntry {
  articleId: string;
  feedHash: string; // 集計用
  action: EngagementAction;
  timestamp: string; // ISO 8601
}

/** R2 に保存するエンゲージメントログ — users/{userId}/engagement.json */
export interface EngagementLog {
  entries: EngagementEntry[]; // 最大 5,000 件、古いものから削除
}

/** レコメンドのソース種別 */
export type RecommendationSource = "ai_suggestion" | "popular" | "link_discovery" | "web_search";

/** レコメンドされたフィード */
export interface RecommendedFeed {
  id: string;
  feedUrl: string;
  title: string;
  siteUrl: string;
  reason: string;
  source: RecommendationSource;
  score: number;
}

/** R2 キャッシュ構造 — users/{userId}/recommendations.json */
export interface RecommendationCache {
  recommendations: RecommendedFeed[];
  generatedAt: string | null;
  dismissedIds: string[];
  topics: string[];
}
export type DateRange = "all" | "today" | "week" | "month";

export interface UserProfile {
  id: string; // 0g0 内部ユーザーID
  sub: string; // ペアワイズ識別子 (JWT sub)
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
    auth: string; // base64url — 認証シークレット (16 bytes)
  };
}

/** R2 に保存するユーザーの Push 通知設定 */
export interface PushConfig {
  subscriptions: PushSubscriptionRecord[];
}

/** 既読・ブックマーク・後で読む・いいね状態 — /api/read-state の入出力型 */
export interface ReadState {
  readIds: string[];
  bookmarkIds: string[];
  readingListIds: string[];
  likeIds: string[];
  globalFilter?: KeywordFilter | null;
  /** この日時以前に公開された記事は全て既読扱い（ISO 8601）*/
  readBeforeTimestamp?: string | null;
}
