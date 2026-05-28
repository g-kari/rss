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
  /** 直近レスポンスの Cache-Control ヘッダー生値（デバッグ・観測用） */
  cacheControl?: string | null;
  /** Cache-Control max-age から算出した次回フェッチ可能時刻（ISO 8601）。cron 時のスキップ判定に使用 */
  nextFetchEarliestAt?: string | null;
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
  /** MAX_PAGES を超えた overflow を末尾ページに追記した際に true になる監視フラグ */
  oversizeAlert?: boolean;
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
  /** カテゴリ — ユーザーが設定したグループ名 */
  category?: string;
  /** フィードグループ ID — `users/{userId}/feed-groups.json` の `FeedGroup.id` を参照 */
  groupId?: string;
  /** ミュート解除予定時刻（ISO 8601）— この時刻までフィードを全フィード表示から非表示にする */
  mutedUntil?: string;
  /** 最終アクセス日時（ISO 8601）— GET /api/feeds 時に更新。cron 非アクティブ判定に使用 */
  lastAccessedAt?: string;
  /** 表示ビュー — サイドバー上部タブでのフィルタに使用 */
  view?: FeedView;
  /** ダイジェストモード時の表示件数 (0 = 全件, undefined = デフォルト 3) */
  digestLimit?: number;
}

/** フィード表示ビュー — サイドバータブの分類に使用 */
export type FeedView = "articles" | "pictures" | "videos" | "social";

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
  /** カテゴリ — ユーザーが設定したグループ名 */
  category?: string;
  /** フィードグループ ID — `users/{userId}/feed-groups.json` の `FeedGroup.id` を参照 */
  groupId?: string;
  /** LLM で CSS セレクタを推論したスクレイピングフィードか */
  isScraping?: boolean;
  /** 現在使用中の CSS セレクタ（isScraping のみ） */
  cssSelector?: string;
  /** 過去に失敗した CSS セレクタの履歴 */
  failedSelectors?: string[];
  /** ミュート解除予定時刻（ISO 8601）— この時刻まで全フィード表示から非表示 */
  mutedUntil?: string;
  /** 表示ビュー — サイドバー上部タブでのフィルタに使用 */
  view?: FeedView;
  /** MAX_PAGES を超えたページ溢れ警告 */
  oversizeAlert?: boolean;
  /** ダイジェストモード時の表示件数 (0 = 全件, undefined = デフォルト 3) */
  digestLimit?: number;
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

export type Layout = "compact" | "list" | "card" | "magazine" | "gallery";
export type FontSize = "small" | "medium" | "large";
export type FontFamily = "sans" | "serif" | "mono";
export type SortOrder = "newest" | "oldest" | "readingTimeAsc";
export type ReadingTimeRange = "all" | "short" | "medium" | "long";

/** 記事に対するユーザーアクション種別 */
export type EngagementAction =
  | "fetch_full" // 全文取得
  | "open_original" // 元記事に遷移
  | "reading_list" // 後で読むに追加
  | "bookmark" // ブックマーク
  | "like" // いいね
  | "ai_feedback"; // AI要約・翻訳の品質評価

/**
 * AI 要約・翻訳の品質評価値。
 * UI / API / hook 全てで参照する単一ソース (#4 simplify 監査での集約対象)。
 * `["good", "neutral", "bad"] as const` を 4 箇所で重複していたのを統合。
 */
export const AI_RATINGS = ["good", "neutral", "bad"] as const;
export type AiRating = (typeof AI_RATINGS)[number];

/** エンゲージメントの1イベント */
export interface EngagementEntry {
  articleId: string;
  feedHash: string; // 集計用
  action: EngagementAction;
  timestamp: string; // ISO 8601
  /** アクション固有のメタデータ（ai_feedback: "good" | "neutral" | "bad"、対象: "summary" | "translate"） */
  value?: string;
}

/** R2 に保存するエンゲージメントログ — users/{userId}/engagement.json */
export interface EngagementLog {
  entries: EngagementEntry[]; // 最大 5,000 件、古いものから削除
}

/** レコメンドされたフィード */
export interface RecommendedFeed {
  id: string;
  feedUrl: string;
  title: string;
  siteUrl: string;
  reason: string;
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
  /** feedHash → false (通知無効) のマップ。未設定 = 通知 ON */
  disabledFeeds?: Record<string, boolean>;
  /** サイレント時間帯 開始時刻 (HH:MM, ローカルタイム) */
  silentStart?: string;
  /** サイレント時間帯 終了時刻 (HH:MM, ローカルタイム) */
  silentEnd?: string;
  /** タイムゾーン (IANA tz, e.g. "Asia/Tokyo") */
  timezone?: string;
  /** フィードエラー通知の有効/無効。デフォルト有効（未設定時は有効扱い） */
  errorNotificationsEnabled?: boolean;
}

/**
 * 既読・ブックマーク・後で読む・いいね状態 — /api/read-state の入出力型。
 *
 * ## optional フィールドについて
 *
 * `globalFilter` / `readBeforeTimestamp` / `snoozedUntil` / `notes` / `tagIds` / `ttlDays`
 * が optional なのは、**R2 に保存された古いデータとの後方互換性**を維持するためです。
 * これらのフィールドが存在しなかった時代に保存されたデータを読み込んでも
 * TypeScript の型エラーにならないよう、意図的に省略可能にしています。
 *
 * - R2 から生データを読み込む場合は `Partial<ReadState>` で取得し、
 *   `normalizeReadState()` を呼んで完全な `ReadState` に変換してください。
 * - `applyServerState` でフィールドの有無を `"field" in state` でチェックするのは、
 *   `undefined`（フィールド欠落 → ローカル状態を保持）と
 *   `null`（明示的なクリア → ローカル状態をリセット）を区別するためです。
 */
export interface ReadState {
  readIds: string[];
  bookmarkIds: string[];
  readingListIds: string[];
  likeIds: string[];
  globalFilter?: KeywordFilter | null;
  /** この日時以前に公開された記事は全て既読扱い（ISO 8601）*/
  readBeforeTimestamp?: string | null;
  /** スヌーズ中の記事 — articleId → スヌーズ解除予定時刻（ISO 8601） */
  snoozedUntil?: Record<string, string> | null;
  /** 記事への個人メモ — articleId → メモ本文（最大 2000 文字） */
  notes?: Record<string, string> | null;
  /** 記事へのカスタムタグ — articleId → タグ名の配列 */
  tagIds?: Record<string, string[]> | null;
  /** 記事保持期間（日数）— null/undefined はデフォルト 30 日 */
  ttlDays?: number | null;
}

/** `/api/feeds/:id` PATCH 用のボディ型 — Feed のうちクライアントから更新可能なフィールドのみ */
export interface FeedPatchPayload {
  nsfw?: boolean;
  priority?: "high" | null;
  category?: string | null;
  groupId?: string | null;
  mutedUntil?: string | null;
  filter?: KeywordFilter | null;
  view?: FeedView | null;
  digestLimit?: number | null;
}

export interface FeedGroup {
  /** グループ ID（サーバー側で `crypto.randomUUID()` により生成） */
  id: string;
  /** 表示名 */
  name: string;
  /** 表示順（昇順） */
  order: number;
  /** 折りたたみ状態 */
  collapsed?: boolean;
  /** グループミュート状態。true のとき、グループ内のフィード記事は「すべての記事」ビューで非表示になる */
  muted?: boolean;
  /** 作成日時（ISO 8601） */
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  articleIds: string[];
  createdAt: string;
  order: number;
}

/** `/api/read-state` POST ボディ型 — 追加差分・削除差分・単値フィールドを一括送信 */
export interface ReadStatePayload {
  readIds: string[];
  bookmarkIds: string[];
  readingListIds: string[];
  likeIds: string[];
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string> | null;
  notes: Record<string, string> | null;
  tagIds: Record<string, string[]> | null;
  removedIds: {
    readIds: string[];
    bookmarkIds: string[];
    readingListIds: string[];
    likeIds: string[];
    tagIds: string[];
  };
  /** キーが存在する場合のみサーバー側で上書きする（他端末設定保護） */
  globalFilter?: KeywordFilter | null;
  /** キーが存在する場合のみサーバー側で上書きする（他端末設定保護） */
  ttlDays?: number | null;
}
