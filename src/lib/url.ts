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

/**
 * IPv4互換 IPv6 アドレス (0::/96) がプライベート IPv4 範囲に相当するか検証する。
 * URL パーサーが [::xxxx:xxxx] 形式に正規化した後のホスト名を受け取る。
 * 例: [::7f00:1] → 127.0.0.1 (ループバック), [::c0a8:101] → 192.168.1.1 (プライベート)
 */
function isPrivateIPv4CompatibleIPv6(hostname: string): boolean {
  // [::1] (ループバック) と [::] (未指定) は別途チェック済み
  if (!hostname.startsWith('[::') || hostname === '[::1]' || hostname === '[::]') return false;

  // '[::' の後、']' の前の部分を取得
  const inner = hostname.slice(3, -1);
  const parts = inner.split(':');

  // IPv4互換アドレスは [::xxxx:xxxx] の2グループ形式に限定
  if (parts.length !== 2) return false;

  const high = parseInt(parts[0], 16);
  const low = parseInt(parts[1], 16);
  if (isNaN(high) || isNaN(low)) return false;

  const ipv4 = ((high << 16) | low) >>> 0;
  const b1 = (ipv4 >>> 24) & 0xff;
  const b2 = (ipv4 >>> 16) & 0xff;

  return (
    b1 === 127 ||                           // 127.0.0.0/8 ループバック
    b1 === 10 ||                            // 10.0.0.0/8
    (b1 === 172 && b2 >= 16 && b2 <= 31) || // 172.16.0.0/12
    (b1 === 192 && b2 === 168) ||           // 192.168.0.0/16
    (b1 === 169 && b2 === 254) ||           // 169.254.0.0/16 リンクローカル
    b1 === 0 ||                             // 0.0.0.0/8
    b1 === 255                              // 255.0.0.0/8
  );
}

function isPrivateHost(hostname: string): boolean {
  if (PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(hostname))) return true;
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) return true;
  // IPv6 ループバック・ユニークローカル・リンクローカル・未指定・各種 IPv4 変換
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
    hostname.startsWith('[::ffff:') ||  // IPv4マップド IPv6 (::ffff:0:0/96)
    hostname.startsWith('[::ffff:0:') || // IPv4変換 IPv6 (::ffff:0:0:0/96, RFC 6145)
    hostname.startsWith('[64:ff9b:') || // NAT64 変換プレフィックス (64:ff9b::/96 および 64:ff9b:1::/48, RFC 6052/8215)
    isPrivateIPv4CompatibleIPv6(hostname) // IPv4互換 IPv6 (0::/96) でプライベート範囲
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
