import { isPlainObject } from "./type-guards";
/** 各種入力バリデーションユーティリティ */

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------
export const MAX_ID_LENGTH = 128;

// ---------------------------------------------------------------------------
// ReadState (既読・ブックマーク・後で読む・スヌーズ・メモ・タグ)
// POST は差分（追加 + removedIds）のみ送られる前提で上限を設定する。
// readIds は記事を読むたびに永続累積するため、多端末ユーザーでも余裕を持たせる。
// それでも 413 が発生した場合はクライアントが再送する（pending に復帰する）。
// ---------------------------------------------------------------------------
export const MAX_READ_IDS = 100_000;
export const MAX_BOOKMARK_IDS = 10_000;
export const MAX_READING_LIST_IDS = 10_000;
export const MAX_LIKE_IDS = 10_000;
export const MAX_SNOOZED = 500;
export const MAX_NOTES = 1_000;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TAGGED_ARTICLES = 2_000;
export const MAX_REMOVED_TAG_KEYS = 2_000;
export const MAX_TAG_NAME_LENGTH = 50;
export const MAX_TAGS_PER_ARTICLE = 20;

// ---------------------------------------------------------------------------
// エンゲージメント
// ---------------------------------------------------------------------------
export const MAX_ENGAGEMENT_ENTRIES = 5_000;

// ---------------------------------------------------------------------------
// 記事保存
// ---------------------------------------------------------------------------
export const MAX_SAVED_ARTICLES = 500;

// ---------------------------------------------------------------------------
// 推薦
// ---------------------------------------------------------------------------
export const MAX_DISMISSED_IDS = 1000;

// ---------------------------------------------------------------------------
// Push 通知
// ---------------------------------------------------------------------------
export const MAX_SUBSCRIPTIONS_PER_USER = 20;

// ---------------------------------------------------------------------------
// 画像プロキシ (Workers リクエストメモリ 128MB 制限内)
// ---------------------------------------------------------------------------
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 動画プロキシ (#715 — 50MB 上限、ユーザー指定)
// ---------------------------------------------------------------------------
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// ---------------------------------------------------------------------------
// フィードインポート
// ---------------------------------------------------------------------------
export const MAX_OPML_ENTRIES = 5000;

// ---------------------------------------------------------------------------
// LLM CSS セレクタ再推論
// ---------------------------------------------------------------------------
export const MAX_FAILED_SELECTORS = 10;

// ---------------------------------------------------------------------------
// リリースノート
// ---------------------------------------------------------------------------
export const MAX_RELEASE_NOTES_LIMIT = 50;

// ---------------------------------------------------------------------------
// コンテンツ取得レートリミット
// ---------------------------------------------------------------------------
export const CONTENT_MAX_CALLS = 120;

/** 制御文字（U+0000–U+001F, U+007F）を除去する */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex -- 制御文字除去は本関数の目的そのもの
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

/**
 * 名前フィールドのバリデーション共通ヘルパー。
 * - 文字列型チェック
 * - 制御文字除去 + trim
 * - 空文字チェック
 * - 最大長チェック
 *
 * 重複名チェックなど Handler 固有のロジックは含まない。
 */
export type ParseNameResult =
  | { ok: true; name: string }
  | { ok: false; message: string; status: 400; code: string };

export function parseName(raw: unknown, maxLength: number): ParseNameResult {
  if (typeof raw !== "string")
    return { ok: false, message: "name must be a string", status: 400, code: "INVALID_NAME" };
  const name = stripControlChars(raw.trim());
  if (!name)
    return {
      ok: false,
      message: "name must be a non-empty string",
      status: 400,
      code: "INVALID_NAME",
    };
  if (name.length > maxLength)
    return { ok: false, message: "name too long", status: 400, code: "INVALID_NAME" };
  return { ok: true, name };
}

export type ParseOrderResult =
  | { ok: true; order: number }
  | { ok: false; message: string; status: 400; code: string };

/**
 * `order` フィールドの defense-in-depth バリデーション純粋関数。
 * 非負整数かつ `max` 以下のみ許容する (Number.MIN/MAX_SAFE_INTEGER 等で
 * sortByOrder 順序や `computeNextOrder` 初期化が破壊されるのを防ぐ)。
 * feed-groups / collections の [id] PATCH ハンドラで共有する (helper drift 解消)。
 */
export function parseOrder(raw: unknown, max: number): ParseOrderResult {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > max) {
    return {
      ok: false,
      message: `order must be a non-negative integer within ${max}`,
      status: 400,
      code: "INVALID_ORDER",
    };
  }
  return { ok: true, order: raw };
}

/** base64url 形式かつ指定バイト範囲に収まるかを検証する */
export function isValidBase64url(value: string, minBytes: number, maxBytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+=*$/.test(value)) return false;
  const stripped = value.replace(/=+$/, "");
  // code-quality 監査 (#2): base64 group は 4 文字単位 (1 group = 3 byte)。
  // 端数が 1 文字残るケースは構造的に不正 (1 char では 0 byte も表現できない)。
  // この check がないと "A=" / 単独 "A" 等が minBytes=0 で誤って通過する。
  if (stripped.length % 4 === 1) return false;
  const decodedBytes = Math.floor((stripped.length * 3) / 4);
  return decodedBytes >= minBytes && decodedBytes <= maxBytes;
}

/** ISO 8601 形式（YYYY-MM-DDTHH:mm:ss[.sss][Z|±HH:MM]）かどうかを判定する型ガード */
export function isValidIso8601(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(v)
  );
}

/**
 * 配列バリデーション＋フィルタ＋重複排除を一括処理する。
 * 上限超過時は null を返す。
 */
export function extractIds(raw: unknown, max: number): string[] | null {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of arr) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_ID_LENGTH) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
  }
  if (deduped.length > max) return null;
  return deduped;
}

/**
 * notes のバリデーション。
 * - 値が Record<string, string> であることを確認
 * - key: articleId（MAX_ID_LENGTH 以内）、value: メモ本文（MAX_NOTE_LENGTH 以内）
 * - MAX_NOTES 件を超える場合は先頭 maxNotes 件に切り詰め（DoS 対策）
 */
export function parseNotes(raw: unknown, maxNotes = 1000): Record<string, string> | null {
  if (!isPlainObject(raw)) return null;
  const result: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= maxNotes) break;
    if (
      typeof k === "string" &&
      k.length > 0 &&
      k.length <= MAX_ID_LENGTH &&
      typeof v === "string" &&
      v.length > 0 &&
      v.length <= MAX_NOTE_LENGTH
    ) {
      result[k] = v;
      count++;
    }
  }
  return count > 0 ? result : null;
}

/**
 * tagIds のバリデーション。
 * - 値が Record<string, string[]> であることを確認
 * - key: articleId（MAX_ID_LENGTH 以内）
 * - value: タグ名の配列（各タグは MAX_TAG_NAME_LENGTH 以内、記事ごとに MAX_TAGS_PER_ARTICLE 件まで）
 * - タグ名は制御文字を除去し trim してから重複排除
 * - maxArticles 件を超える場合は先頭から切り詰め（DoS 対策）
 */
export function parseTagIds(raw: unknown, maxArticles = 1000): Record<string, string[]> | null {
  if (!isPlainObject(raw)) return null;
  const result: Record<string, string[]> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= maxArticles) break;
    if (typeof k !== "string" || k.length === 0 || k.length > MAX_ID_LENGTH) continue;
    if (!Array.isArray(v)) continue;
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const t of v) {
      if (tags.length >= MAX_TAGS_PER_ARTICLE) break;
      if (typeof t !== "string") continue;
      const normalized = stripControlChars(t).trim();
      if (normalized.length === 0 || normalized.length > MAX_TAG_NAME_LENGTH) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      tags.push(normalized);
    }
    if (tags.length > 0) {
      result[k] = tags;
      count++;
    }
  }
  return count > 0 ? result : null;
}

/**
 * feedHash（16桁小文字16進数）として有効かどうかを判定する。
 * computeFeedHash が SHA-256 の先頭 16 文字を返す仕様に対応。
 */
export function isValidFeedHash(value: string): boolean {
  return /^[0-9a-f]{16}$/.test(value);
}

/**
 * セッション ID（UUID 形式）として有効かどうかを判定する。
 * crypto.randomUUID() は v4 を生成するが、ここでは R2 キー埋め込みのパストラバーサル防止が
 * 主目的のため UUID 一般形式を許容する（v4 固有のバリアントビット制約は強制しない）。
 * 信頼境界を越える sessionId はこの関数で必ず再検証する。
 */
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidSessionId(value: string): boolean {
  return SESSION_ID_RE.test(value);
}

/**
 * ユーザー ID として有効かどうかを判定する。
 * JWT の sub クレーム / R2 キー（users/{userId}/...）に直接埋め込まれる値で、
 * パストラバーサル防止のためセーフな文字のみ許可する。
 *
 * 信頼境界を越える userId（JWT 検証直後 / R2 から読み出した sessions/<id>.json の userId 等）
 * はこの関数で必ず再検証する。
 */
const USER_ID_RE = /^[A-Za-z0-9_\-@.]{1,128}$/;
export function isValidUserId(value: string): boolean {
  return USER_ID_RE.test(value);
}

/** Cookie ヘッダー値として安全な文字列か検証する（HTTP ヘッダーインジェクション・Cookie jar poison 防止） */
export function isValidCookieHeader(value: string): boolean {
  // 長さ上限を 2000 文字に制限（HTTP ヘッダー全体 8KB 制限に対して余裕を確保）
  if (value.length > 2000) return false;
  // CRLF インジェクション対策: \r \n を明示的に拒否（ヘッダー分割攻撃の防止）
  if (/[\r\n]/.test(value)) return false;
  // [\x20-\x7E] は印字可能 ASCII のみ許容し、制御文字を除外する
  if (!/^[\x20-\x7E]*$/.test(value)) return false;
  // RFC 6265 準拠: name=value ペアの形式検証（複数は "; " で区切る）
  const pairs = value.split(/;\s*/);
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) return false; // name が空または "=" がない
    const name = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1);
    // name: RFC 2616 token 文字のみ（空白・制御文字・区切り文字を禁止）
    if (!/^[\w\-!#$%&'*+.^`|~]+$/.test(name)) return false;
    // value: セミコロン・カンマを禁止して Cookie jar poisoning を防止
    if (/[;,]/.test(val)) return false;
  }
  return true;
}

/**
 * snoozedUntil のバリデーション。
 * - 値が Record<string, string> であることを確認する
 * - 各エントリの key/value が文字列であることを確認する
 * - MAX_SNOOZED 件を超える場合は先頭 maxSnoozed 件に切り詰め（DoS 対策）
 * - 期限切れのエントリを除去する
 */
export function parseSnoozedUntil(raw: unknown, maxSnoozed = 500): Record<string, string> | null {
  if (!isPlainObject(raw)) return null;
  const nowMs = Date.now();
  const result: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (count >= maxSnoozed) break;
    if (
      typeof k === "string" &&
      k.length > 0 &&
      k.length <= MAX_ID_LENGTH &&
      isValidIso8601(v) &&
      Date.parse(v) > nowMs // 期限切れを除去 (タイムゾーン付き ISO 8601 対応: "+09:00" 等は文字列比較で誤廃棄するため ms 比較に変更)
    ) {
      result[k] = v;
      count++;
    }
  }
  return count > 0 ? result : null;
}
