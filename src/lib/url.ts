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
  // CGNAT (RFC 6598): 100.64.0.0/10 — キャリアグレード NAT の共有アドレス空間
  // クラウド/ISP 環境で内部ルーティングに使われるため SSRF 経路になりえる
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  // ブロードキャスト
  /^0\./,
  /^255\./,
];

const PRIVATE_HOSTNAME_PATTERNS = [/^localhost$/i, /\.local$/i, /\.internal$/i, /\.localhost$/i];

/**
 * IPv4互換 IPv6 アドレス (0::/96) がプライベート IPv4 範囲に相当するか検証する。
 * URL パーサーが [::xxxx:xxxx] 形式に正規化した後のホスト名を受け取る。
 * 例: [::7f00:1] → 127.0.0.1 (ループバック), [::c0a8:101] → 192.168.1.1 (プライベート)
 */
function isPrivateIPv4CompatibleIPv6(hostname: string): boolean {
  // [::1] (ループバック) と [::] (未指定) は別途チェック済み
  if (!hostname.startsWith("[::") || hostname === "[::1]" || hostname === "[::]") return false;

  // '[::' の後、']' の前の部分を取得
  const inner = hostname.slice(3, -1);
  const parts = inner.split(":");

  // IPv4互換アドレスは [::xxxx:xxxx] の2グループ形式に限定
  if (parts.length !== 2) return false;

  const high = parseInt(parts[0], 16);
  const low = parseInt(parts[1], 16);
  if (isNaN(high) || isNaN(low)) return false;

  const ipv4 = ((high << 16) | low) >>> 0;
  const b1 = (ipv4 >>> 24) & 0xff;
  const b2 = (ipv4 >>> 16) & 0xff;

  return (
    b1 === 127 || // 127.0.0.0/8 ループバック
    b1 === 10 || // 10.0.0.0/8
    (b1 === 172 && b2 >= 16 && b2 <= 31) || // 172.16.0.0/12
    (b1 === 192 && b2 === 168) || // 192.168.0.0/16
    (b1 === 169 && b2 === 254) || // 169.254.0.0/16 リンクローカル
    (b1 === 100 && b2 >= 64 && b2 <= 127) || // 100.64.0.0/10 CGNAT (RFC 6598)
    b1 === 0 || // 0.0.0.0/8
    b1 === 255 // 255.0.0.0/8
  );
}

/**
 * IPv6 リンクローカルアドレス fe80::/10 か判定する。
 * URL ホスト名は "[xxxx:...]" 形式。第1グループの上位10ビットが 0xfe80 かをビット演算で確認する。
 * fe80::/10 = 上位10ビット 1111111010 → (firstGroup & 0xffc0) === 0xfe80 (0xfe80〜0xfebf)
 */
function isIPv6LinkLocal(hostname: string): boolean {
  if (!hostname.startsWith("[fe")) return false;
  // '[xxxx:...]' の形式から第1グループを取り出す
  const inner = hostname.slice(1);
  const end = inner.indexOf(":");
  if (end < 0) return false;
  const firstGroup = parseInt(inner.slice(0, end), 16);
  if (isNaN(firstGroup)) return false;
  return (firstGroup & 0xffc0) === 0xfe80;
}

/**
 * ホスト名またはIPアドレスがプライベート・ループバック・リンクローカル等の
 * 内部ネットワークに属するか判定する（SSRF 対策）。
 *
 * @param hostname - URL.hostname から取得したホスト名（IPv6 は "[...]" 形式）
 * @returns プライベートホストであれば true
 */
export function isPrivateHost(hostname: string): boolean {
  if (PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(hostname))) return true;
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) return true;
  // IPv6 ループバック・ユニークローカル・リンクローカル・未指定・各種 IPv4 変換
  if (
    hostname === "[::1]" || // ループバック
    hostname === "[::]" || // 未指定アドレス
    hostname.startsWith("[fc") || // ユニークローカル fc00::/7 (fc部分)
    hostname.startsWith("[fd") || // ユニークローカル fc00::/7 (fd部分)
    isIPv6LinkLocal(hostname) || // リンクローカル fe80::/10 (0xfe80〜0xfebf)
    hostname.startsWith("[::ffff:") || // IPv4マップド IPv6 (::ffff:0:0/96)
    hostname.startsWith("[::ffff:0:") || // IPv4変換 IPv6 (::ffff:0:0:0/96, RFC 6145)
    hostname.startsWith("[64:ff9b:") || // NAT64 変換プレフィックス (64:ff9b::/96 および 64:ff9b:1::/48, RFC 6052/8215)
    isPrivateIPv4CompatibleIPv6(hostname) // IPv4互換 IPv6 (0::/96) でプライベート範囲
  )
    return true;
  return false;
}

/** URL の最大許容長。DoS・ストレージ肥大化対策。 */
export const MAX_URL_LENGTH = 2048;

/** URL オブジェクトの protocol が http: または https: かを返す */
function isValidHttpProtocol(protocol: string, allowHttp: boolean): boolean {
  return protocol === "https:" || (allowHttp && protocol === "http:");
}

/**
 * URL バリデーション共通ロジック。
 * 最大長チェック・スキーム検証・プライベートホスト拒否を行う。
 * `allowHttp=true` の場合は http: も許可し、false の場合は https: のみ許可する。
 *
 * @param url - 検証対象の URL 文字列
 * @param allowHttp - http スキームを許可するか
 * @returns 有効な URL であれば true
 */
function isValidUrl(url: string, allowHttp: boolean): boolean {
  if (url.length > MAX_URL_LENGTH) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return isValidHttpProtocol(protocol, allowHttp) && !isPrivateHost(hostname);
  } catch {
    return false;
  }
}

/**
 * フィード URL として有効かどうかを検証する。
 * http および https の両方を許可し、プライベートホストへのアクセスは拒否する（SSRF 対策）。
 *
 * @param url - 検証対象の URL 文字列
 * @returns 有効なフィード URL であれば true
 */
export function isValidFeedUrl(url: string): boolean {
  return isValidUrl(url, true);
}

/**
 * 画像 URL のドメイン別最大長。
 * imgix 等コンポジット URL を生成する CDN はパラメータが長くなるため制限を緩める。
 * それ以外のドメインはデフォルト上限を適用する。
 */
const IMAGE_URL_MAX_LENGTH_DEFAULT = 8192;
const IMAGE_DOMAIN_MAX_LENGTHS: { suffix: string; maxLength: number }[] = [
  { suffix: ".imgix.net", maxLength: 32768 }, // imgix CDN（Qiita 等）
];

/**
 * ホスト名に応じた画像 URL の最大許容長を返す。
 * imgix 等の CDN はパラメータが長くなるため、ドメインごとに上限を緩める設定を持つ。
 *
 * @param hostname - URL.hostname から取得したホスト名
 * @returns 許容する URL の最大文字数
 */
function imageUrlMaxLength(hostname: string): number {
  for (const { suffix, maxLength } of IMAGE_DOMAIN_MAX_LENGTHS) {
    if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) return maxLength;
  }
  return IMAGE_URL_MAX_LENGTH_DEFAULT;
}

/**
 * サーバーが取得したページから得た URL（OGP 画像等）の検証。
 * SSRF 対策を行いつつ、ドメインごとに URL 長の上限を変える。
 * ユーザー入力の feed URL とは異なり、一律 2048 文字制限は適用しない。
 */
export function isValidPublicUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (!isValidHttpProtocol(protocol, true) || isPrivateHost(hostname)) return false;
    return url.length <= imageUrlMaxLength(hostname);
  } catch {
    return false;
  }
}

/**
 * HTTPS URL として有効かどうかを検証する。
 * プッシュ通知エンドポイント等、HTTPS のみ許可する場面で使用する。
 * HTTP は拒否し、プライベート IP レンジへのアクセスも拒否する（SSRF 対策）。
 */
export function isValidHttpsUrl(url: string): boolean {
  return isValidUrl(url, false);
}

/** normalizeUrlForCache() で除去する純粋なトラッキング専用クエリパラメータ一覧。 */
const TRACKING_PARAMS = new Set([
  // Google Analytics UTM
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  // Google Ads
  "gclid",
  "gbraid",
  "wbraid",
  "gclsrc",
  // Facebook / Instagram
  "fbclid",
  "igshid",
  // Microsoft Ads
  "msclkid",
  // Mailchimp
  "mc_cid",
  "mc_eid",
  // その他 Analytics
  "_ga",
  "_gl",
  // Yahoo! Japan Ads (yclid = Yahoo Click ID)
  "yclid",
  // Twitter / X Ads
  "twclid",
  // Pinterest
  "epik",
  // LinkedIn
  "li_fat_id",
  // TikTok Ads
  "ttclid",
  // Drip email
  "__s",
  // ConvertKit
  "ck_subscriber_id",
  // Klaviyo
  "_kx",
]);

/**
 * キャッシュキー生成用に URL を正規化する。
 * UTM / 広告クリック等の純粋なトラッキングパラメータを除去し、
 * 残りのパラメータをソートして一意なキャッシュキーを生成する。
 * フラグメント（`#...`）はサーバー側に送信されないため除去する。
 *
 * @param url - 正規化対象の URL 文字列
 * @returns 正規化後の URL 文字列。パース失敗時は元の文字列をそのまま返す
 */
export function normalizeUrlForCache(url: string): string {
  try {
    const parsed = new URL(url);
    // イテレーション中に削除するとキーがスキップされるため、先に収集してから削除する
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key)) parsed.searchParams.delete(key);
    }
    // パラメータ順序が異なる同一 URL も同じキャッシュキーにする
    parsed.searchParams.sort();
    // フラグメントはサーバー側に送信されないためキャッシュキーには不要
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

/** URL が http/https スキームで始まるか判定する絶対 URL ガード。 */
export function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * pageUrl が zenn.dev ドメインかどうかを URL パースで厳密に検証する。
 * includes() による部分文字列マッチは "zenn.dev.evil.com" でバイパスできるため、
 * hostname を正確に検証する。
 */
export function isZennDevUrl(pageUrl: string): boolean {
  const h = tryParseBase(pageUrl)?.hostname;
  return !!h && (h === "zenn.dev" || h.endsWith(".zenn.dev"));
}

/** pageUrl を URL オブジェクトにパースする。無効・空の場合は null を返す。 */
export function tryParseBase(pageUrl: string): URL | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl);
  } catch {
    return null;
  }
}
