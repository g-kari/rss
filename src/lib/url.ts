/**
 * URL が http/https スキームか検証する。
 * SSRF 対策として、フィード URL 追加・インポート・cron フェッチ前に使用する。
 * プライベート IP レンジ・ループバック・リンクローカルへのアクセスも拒否する。
 */

const PRIVATE_IP_PATTERNS = [
  // IPv4 ループバック
  /^127\./,
  // IPv4 プライベート
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // リンクローカル
  /^169\.254\./,
  // ブロードキャスト
  /^0\./,
  /^255\./,
];

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
];

function isPrivateHost(hostname: string): boolean {
  if (PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(hostname))) return true;
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) return true;
  // IPv6 ループバック・ユニークローカル・リンクローカル・未指定・IPv4マップド
  if (
    hostname === '[::1]' ||          // ループバック
    hostname === '[::]' ||           // 未指定アドレス
    hostname.startsWith('[fc') ||    // ユニークローカル fc00::/7
    hostname.startsWith('[fd') ||    // ユニークローカル fd00::/8
    hostname.startsWith('[fe80') ||  // リンクローカル fe80::/10
    hostname.startsWith('[::ffff:')  // IPv4マップドIPv6
  ) return true;
  return false;
}

/**
 * コンテンツ・画像フェッチをブロックするドメインのリスト。
 * Anubis 等のボット対策で JS PoW を要求し、サーバーサイドフェッチが常に失敗するドメインを登録する。
 */
const FETCH_BLOCKED_DOMAINS = [
  'nitter.privacyredirect.com',
];

/**
 * 指定 URL のドメインがフェッチブロックリストに含まれているかを返す。
 * `/api/content` および `/api/image-proxy` でのフェッチ前に使用する。
 */
export function isFetchBlocked(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return FETCH_BLOCKED_DOMAINS.some(
      (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
    );
  } catch {
    return false;
  }
}

export function isValidFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (isPrivateHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
