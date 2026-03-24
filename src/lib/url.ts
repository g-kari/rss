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
    hostname.startsWith('[fc') ||    // ユニークローカル fc00::/7 (fc部分)
    hostname.startsWith('[fd') ||    // ユニークローカル fc00::/7 (fd部分)
    // リンクローカル fe80::/10 (fe80:: 〜 febf:: = 第1グループ 0xfe80-0xfebf)
    // startsWith('[fe80') のみでは [fe90::], [fea0::], [feb0::] 等が漏れるため
    // 第3ニブルが 8〜b (0x8〜0xb) の全パターンを明示的にチェックする
    hostname.startsWith('[fe8') ||
    hostname.startsWith('[fe9') ||
    hostname.startsWith('[fea') ||
    hostname.startsWith('[feb') ||
    hostname.startsWith('[::ffff:')  // IPv4マップドIPv6 (::ffff:0:0/96)
  ) return true;
  return false;
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
