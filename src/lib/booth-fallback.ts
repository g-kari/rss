/**
 * x.com / twitter.com 系フィードの thumbnail fallback 用 booth.pm URL 抽出純粋関数 (#750)。
 *
 * x.com の post text に booth.pm 関連 URL が含まれている場合、x.com 自体の OGP では商品画像が
 * 取れないことが多いため、description 内の booth.pm URL を抽出してその OGP も併用する。
 *
 * 適用範囲: x.com 系フィードのみ。他フィードでは本関数は null を返し、caller は primary OGP
 * (article.ogImage / ogpCache[article.link]) を使う。
 *
 * 抽出ルール:
 *   - article.link が x.com 系ホスト (`isXComHost`) であること
 *   - article.summary (= RSS description / post text) から最初に出現する booth.pm URL を返す
 *   - サブドメイン (`xxx.booth.pm`) や bare host (`booth.pm`) のいずれも対象
 *   - URL は http(s):// で始まる絶対 URL のみ (相対 URL / data: 等は無視)
 */

import { isXComHost } from "./x-com-fallback";

/**
 * booth.pm URL を 1 件抽出する正規表現。
 *
 * - bare host `booth.pm` または subdomain `<name>.booth.pm` 両対応
 * - path は 1 文字以上 (空 path はサイトトップなのでスキップ — 商品画像取得できない)
 * - URL 末尾の whitespace / quote / 角括弧で停止
 *
 * Note: 正規表現は string 全体に対して 1 回だけ match を取り、最初の hit を返す。
 * post text に複数 booth URL がある稀ケースは別 Issue で考える (現状は最初のみで十分)。
 */
const BOOTH_URL_RE = /https?:\/\/(?:[a-z0-9-]+\.)?booth\.pm\/[^\s"'<>)]+/i;

export interface BoothFallbackInput {
  /** 記事 URL (x.com 系判定に使う) */
  readonly link?: string | null;
  /** RSS description / post text */
  readonly summary?: string | null;
}

/**
 * x.com 系フィードかつ description に booth.pm URL を含む場合、その URL を返す。
 * それ以外 (非 x.com / summary 空 / booth URL なし) は null。
 */
export function extractBoothFallbackUrl(input: BoothFallbackInput): string | null {
  if (!isXComHost(input.link ?? null)) return null;
  if (!input.summary) return null;
  const match = input.summary.match(BOOTH_URL_RE);
  return match ? match[0] : null;
}
