/**
 * URL が http/https スキームか検証する。
 * SSRF 対策として、フィード URL 追加・インポート・cron フェッチ前に使用する。
 */
export function isValidFeedUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
