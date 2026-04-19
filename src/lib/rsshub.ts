/**
 * RSSHub URL 変換
 *
 * RSS が提供されていない主要サービスの URL を、
 * RSSHub (https://docs.rsshub.app/) の対応エンドポイントに変換する。
 *
 * RSSHub インスタンスはデフォルトで公式の https://rsshub.app/ を利用する。
 * 将来的にユーザー毎のセルフホストインスタンスを使いたい場合は
 * RSSHUB_INSTANCE_URL 環境変数で上書き可能（process.env 経由）。
 */

export const DEFAULT_RSSHUB_INSTANCE = "https://rsshub.app";

interface RSSHubRoute {
  /** ヒューマンリーダブルな対応サービス名 */
  service: string;
  /** マッチング用正規表現 (URL 全体にかける) */
  pattern: RegExp;
  /**
   * 変換後のパス生成関数。
   * null を返した場合はこのルートを「マッチしなかった」扱いにして次のルートへ進む。
   * サービス固有の予約語を弾きたい場合などに使う。
   */
  build: (match: RegExpMatchArray) => string | null;
}

/**
 * GitHub の URL 第 1 階層で予約されている名前（ユーザー名として使えない）。
 * これらは `github.com/xxx` の形でも RSSHub の user ルートに変換してはいけない。
 * 参考: https://github.com/signup で取得できない名前の一部 + サイトナビ。
 */
const GITHUB_RESERVED_FIRST_SEGMENT = new Set([
  "marketplace",
  "topics",
  "trending",
  "collections",
  "events",
  "features",
  "pricing",
  "about",
  "enterprise",
  "sponsors",
  "orgs",
  "organizations",
  "settings",
  "notifications",
  "explore",
  "login",
  "logout",
  "signup",
  "join",
  "new",
  "issues",
  "pulls",
  "dashboard",
  "search",
  "readme",
  "codespaces",
  "copilot",
  "security",
  "apps",
  "integrations",
  "site",
  "contact",
  "assets",
  "static",
]);

/**
 * 対応ルート定義。
 *
 * いずれも RSSHub の公式ドキュメントに存在するルート:
 *   https://docs.rsshub.app/routes/
 *
 * 追加する際は:
 * - マッチは URL 文字列全体に対して行う (末尾スラッシュの有無は両対応)
 * - RSSHub のルートが実在するか docs.rsshub.app で確認してから追加する
 */
const ROUTES: RSSHubRoute[] = [
  // Twitter / X: ユーザータイムライン
  {
    service: "Twitter",
    pattern: /^https?:\/\/(?:(?:www\.|mobile\.)?twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/?$/,
    build: (m) => `/twitter/user/${m[1]}`,
  },

  // YouTube: チャンネル (UC... ID)
  {
    service: "YouTube Channel",
    pattern: /^https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/,
    build: (m) => `/youtube/channel/${m[1]}`,
  },

  // YouTube: ユーザー (旧形式)
  {
    service: "YouTube User",
    pattern: /^https?:\/\/(?:www\.)?youtube\.com\/user\/([A-Za-z0-9_-]+)\/?$/,
    build: (m) => `/youtube/user/${m[1]}`,
  },

  // YouTube: @handle
  {
    service: "YouTube Handle",
    pattern: /^https?:\/\/(?:www\.)?youtube\.com\/@([A-Za-z0-9_.-]+)\/?$/,
    build: (m) => `/youtube/@${m[1]}`,
  },

  // GitHub: ユーザー/組織の全アクティビティ
  {
    service: "GitHub User",
    pattern: /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/?$/,
    build: (m) => {
      const username = m[1];
      if (GITHUB_RESERVED_FIRST_SEGMENT.has(username.toLowerCase())) return null;
      return `/github/user/${username}`;
    },
  },

  // GitHub: リポジトリのリリース
  {
    service: "GitHub Releases",
    pattern:
      /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)\/releases\/?$/,
    build: (m) => `/github/release/${m[1]}/${m[2]}`,
  },

  // GitHub: リポジトリの issue
  {
    service: "GitHub Issues",
    pattern:
      /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)\/issues\/?$/,
    build: (m) => `/github/issue/${m[1]}/${m[2]}`,
  },

  // Instagram: ユーザー
  {
    service: "Instagram",
    pattern: /^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?$/,
    build: (m) => `/instagram/user/${m[1]}`,
  },

  // Reddit: サブレディット
  {
    service: "Reddit Subreddit",
    pattern: /^https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/([A-Za-z0-9_]+)\/?$/,
    build: (m) => `/reddit/r/${m[1]}`,
  },

  // Bilibili: ユーザー投稿動画
  {
    service: "Bilibili User",
    pattern: /^https?:\/\/space\.bilibili\.com\/(\d+)\/?$/,
    build: (m) => `/bilibili/user/video/${m[1]}`,
  },

  // Zhihu: ユーザー
  {
    service: "Zhihu User",
    pattern: /^https?:\/\/(?:www\.)?zhihu\.com\/people\/([A-Za-z0-9_-]+)\/?$/,
    build: (m) => `/zhihu/people/activities/${m[1]}`,
  },

  // Pixiv: ユーザー作品
  {
    service: "Pixiv User",
    pattern: /^https?:\/\/(?:www\.)?pixiv\.net\/users\/(\d+)\/?$/,
    build: (m) => `/pixiv/user/${m[1]}`,
  },

  // Weibo: ユーザー
  {
    service: "Weibo User",
    pattern: /^https?:\/\/(?:www\.)?weibo\.com\/u\/(\d+)\/?$/,
    build: (m) => `/weibo/user/${m[1]}`,
  },

  // Telegram: チャネル
  {
    service: "Telegram Channel",
    pattern: /^https?:\/\/t\.me\/s?\/?([A-Za-z0-9_]{5,32})\/?$/,
    build: (m) => `/telegram/channel/${m[1]}`,
  },
];

export interface RSSHubMatch {
  /** 生成された RSSHub URL */
  rsshubUrl: string;
  /** 対応サービス名 (UI への通知などに使用) */
  service: string;
}

/**
 * URL が RSSHub 対応サービスであれば、対応する RSSHub URL を返す。
 * 未対応の URL なら null を返す (呼び出し元は元 URL をそのまま扱えばよい)。
 *
 * @param accessKey セルフホスト RSSHub の ACCESS_KEY（指定時は `?key=...` を付与）
 */
export function resolveRSSHubUrl(
  url: string,
  instanceUrl: string = DEFAULT_RSSHUB_INSTANCE,
  accessKey?: string,
): RSSHubMatch | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  for (const route of ROUTES) {
    const match = trimmed.match(route.pattern);
    if (!match) continue;

    const path = route.build(match);
    if (path === null) continue; // 予約語などで弾かれた場合は次のルートへ
    const base = instanceUrl.replace(/\/+$/, "");
    const query = accessKey?.trim() ? `?key=${encodeURIComponent(accessKey.trim())}` : "";
    return {
      rsshubUrl: `${base}${path}${query}`,
      service: route.service,
    };
  }

  return null;
}

/**
 * 設定された RSSHub インスタンスの URL を返す。
 * 未設定または不正な値の場合はデフォルトにフォールバック。
 */
export function getRSSHubInstance(): string {
  const fromEnv = process.env.RSSHUB_INSTANCE_URL?.trim();
  if (!fromEnv) return DEFAULT_RSSHUB_INSTANCE;
  try {
    const u = new URL(fromEnv);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return DEFAULT_RSSHUB_INSTANCE;
    }
    return fromEnv.replace(/\/+$/, "");
  } catch {
    return DEFAULT_RSSHUB_INSTANCE;
  }
}

/**
 * セルフホスト RSSHub の ACCESS_KEY を返す。
 * 未設定の場合は undefined（= 認証なしインスタンス扱い）。
 *
 * `RSSHUB_ACCESS_KEY` シークレットに設定すると、生成 URL の末尾に `?key=...` が
 * 付与されるため、認証必須のセルフホスト RSSHub でも購読できるようになる。
 */
export function getRSSHubAccessKey(): string | undefined {
  const key = process.env.RSSHUB_ACCESS_KEY?.trim();
  return key ? key : undefined;
}
