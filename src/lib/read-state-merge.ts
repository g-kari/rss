import type { KeywordFilter, ReadState } from "../types";
import { r2Get, readStateKey } from "./r2";

/** POST /api/read-state で送信する削除差分 */
export interface ReadStateRemovedIds {
  readIds?: string[];
  bookmarkIds?: string[];
  readingListIds?: string[];
  likeIds?: string[];
  /** tagIds マップから完全に削除する articleId 配列 */
  tagIds?: string[];
  /** notes マップから完全に削除する articleId 配列 (#1084 cross-device note 削除) */
  notes?: string[];
}

/** POST /api/read-state の入力型（追加分 + 削除差分） */
export interface ReadStateUpdate extends Partial<ReadState> {
  removedIds?: ReadStateRemovedIds;
}

function mergeIdList(
  existing: readonly string[] | undefined,
  incoming: readonly string[] | undefined,
  removed: readonly string[] | undefined,
): string[] {
  const ex = existing ?? [];
  const inc = incoming ?? [];
  const rem = removed ?? [];

  if (!rem.length && !inc.length) return [...ex];

  if (!rem.length) {
    const seen = new Set(ex);
    const result = [...ex];
    for (const id of inc) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
    return result;
  }

  const removedSet = new Set(rem);
  const result = new Set<string>();
  for (const id of ex) if (!removedSet.has(id)) result.add(id);
  for (const id of inc) if (!removedSet.has(id)) result.add(id);
  return [...result];
}

function mergeSnoozed(
  existing: Record<string, string> | null | undefined,
  incoming: Record<string, string> | null | undefined,
): Record<string, string> | null {
  const merged: Record<string, string> = { ...existing };
  for (const [id, until] of Object.entries(incoming ?? {})) {
    const prev = merged[id];
    // ISO 8601 文字列の lexicographic 比較は timezone suffix で誤判定する
    // (例: "2026-01-01T00:00:00+00:00" < "2026-01-01T00:00:00.000Z" だが同時刻)。
    // Date.parse で時刻基準で比較。code-quality #1 / #2 と同じ sibling 規範。
    if (!prev || isLaterIso(until, prev)) merged[id] = until;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function mergeNotes(
  existing: Record<string, string> | null | undefined,
  incoming: Record<string, string> | null | undefined,
  removedKeys: readonly string[] | undefined,
): Record<string, string> | null {
  // #1084: tags と対称な removal channel。removedKeys に含まれる articleId は merge 対象から
  // 除外して削除を伝播する (旧実装は `{...existing, ...incoming}` で削除を伝播できず、削除した
  // note が次 sync で復活していた)。
  const removedSet = new Set(removedKeys ?? []);
  const merged: Record<string, string> = {};
  let size = 0;
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (removedSet.has(k)) continue;
    merged[k] = v;
    size++;
  }
  for (const [k, v] of Object.entries(incoming ?? {})) {
    if (removedSet.has(k)) continue;
    if (!Object.hasOwn(merged, k)) size++;
    merged[k] = v;
  }
  return size > 0 ? merged : null;
}

/** マージ結果に保持する記事タグのハードリミット（R2 レコード肥大化防止） */
const MAX_TAGGED_ARTICLES_STORED = 5_000;

/**
 * tagIds のマージ。
 * - incoming のキーは incoming を採用（クライアント最終状態で上書き）
 * - removedKeys に含まれるキーは結果から除去
 * - それ以外のキーは existing を保持
 * - 合計件数が MAX_TAGGED_ARTICLES_STORED を超える場合は古いキーから切り詰める
 *   （Record のキー挿入順を利用して、既存の頭から落とす）
 * 各記事のタグは「そのクライアントでのタグ全体」を想定し、キーごと完全置換する方針。
 */
function mergeTags(
  existing: Record<string, string[]> | null | undefined,
  incoming: Record<string, string[]> | null | undefined,
  removedKeys: readonly string[] | undefined,
): Record<string, string[]> | null {
  const removedSet = new Set(removedKeys ?? []);
  const merged: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (removedSet.has(k)) continue;
    merged[k] = v;
  }
  for (const [k, v] of Object.entries(incoming ?? {})) {
    if (removedSet.has(k)) continue;
    merged[k] = v;
  }
  const keys = Object.keys(merged);
  let finalSize = keys.length;
  if (keys.length > MAX_TAGGED_ARTICLES_STORED) {
    const toDrop = keys.length - MAX_TAGGED_ARTICLES_STORED;
    for (let i = 0; i < toDrop; i++) delete merged[keys[i]!];
    finalSize -= toDrop;
  }
  return finalSize > 0 ? merged : null;
}

/**
 * ISO 8601 文字列 a が b より厳密に後の時刻か判定する純粋ヘルパー。
 *
 * `a > b` の lexicographic 比較は timezone suffix の文字コード差で誤判定する
 * (例: `"2026-01-01T00:00:00+00:00"` (`+` = 0x2B) < `"2026-01-01T00:00:00.000Z"` (`.` = 0x2E)
 * だが同時刻)。`Date.parse` で **絶対時刻基準** で比較する。
 *
 * 不正な ISO 文字列は `NaN` 比較で false を返す (= 既存値を優先) ため、
 * 万一壊れた input が来てもデータ消失しない。
 *
 * code-quality #1 (`read-state-prune.ts` の `Date.parse` 比較) と同じ sibling 規範
 * (`coding-conventions.md` 「同じデータに動作する sibling 純粋関数は fallback chain を完全に揃える」)。
 */
export function isLaterIso(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (isNaN(ta) || isNaN(tb)) return false;
  return ta > tb;
}

function chooseLater(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  // 不正な ISO 文字列が片方だけのときは valid な方を採用 (データ消失防止)
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (isNaN(ta) && isNaN(tb)) return a; // 両方不正 → 既存維持
  if (isNaN(ta)) return b;
  if (isNaN(tb)) return a;
  return ta > tb ? a : b;
}

/**
 * サーバー側 POST /api/read-state のマージ処理。
 * 既存 ReadState と update (追加 + 削除差分) を 3-way でマージして返す。
 *
 * - readIds / bookmarkIds / readingListIds / likeIds: (existing ∪ update) \ removed
 *   → 他端末の追加を失わず、明示的な削除は伝播する
 * - globalFilter: update で指定されていれば上書き（明示的 null で解除も可）
 * - readBeforeTimestamp: より遅い方を採用（後退しない）
 * - snoozedUntil: キー単位で until が遅い方を採用
 * - notes: キー単位で update 優先マージ（存在しないキーは既存を保持）
 */
export function mergeReadStateUpdate(
  existing: ReadState,
  update: ReadStateUpdate,
  maxReadIds?: number,
): ReadState {
  const removed = update.removedIds ?? {};
  const readIds = mergeIdList(existing.readIds, update.readIds, removed.readIds);
  const bookmarkIds = mergeIdList(existing.bookmarkIds, update.bookmarkIds, removed.bookmarkIds);
  const readingListIds = mergeIdList(
    existing.readingListIds,
    update.readingListIds,
    removed.readingListIds,
  );
  const likeIds = mergeIdList(existing.likeIds, update.likeIds, removed.likeIds);

  // globalFilter は update にキーが含まれていれば上書き（明示的 null は「フィルター解除」を意味する）
  const globalFilter: KeywordFilter | null =
    "globalFilter" in update ? (update.globalFilter ?? null) : (existing.globalFilter ?? null);

  // ttlDays は update にキーが含まれていれば上書き（明示的 null は「デフォルト TTL に戻す」を意味する）
  const ttlDays: number | null =
    "ttlDays" in update ? (update.ttlDays ?? null) : (existing.ttlDays ?? null);

  const readBeforeTimestamp = chooseLater(existing.readBeforeTimestamp, update.readBeforeTimestamp);

  const snoozedUntil = mergeSnoozed(existing.snoozedUntil, update.snoozedUntil);
  const notes = mergeNotes(existing.notes, update.notes, removed.notes);
  const tagIds = mergeTags(existing.tagIds, update.tagIds, removed.tagIds);

  return {
    readIds: maxReadIds && readIds.length > maxReadIds ? readIds.slice(-maxReadIds) : readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    globalFilter,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
    tagIds,
    ttlDays,
  };
}

/** Partial<ReadState> にデフォルト値を補完して完全な ReadState を返す（古いデータ形式との互換性）*/
export function normalizeReadState(stored: Partial<ReadState>): ReadState {
  return {
    readIds: stored.readIds ?? [],
    bookmarkIds: stored.bookmarkIds ?? [],
    readingListIds: stored.readingListIds ?? [],
    likeIds: stored.likeIds ?? [],
    globalFilter: stored.globalFilter ?? null,
    readBeforeTimestamp: stored.readBeforeTimestamp ?? null,
    snoozedUntil: stored.snoozedUntil ?? null,
    notes: stored.notes ?? null,
    tagIds: stored.tagIds ?? null,
    ttlDays: stored.ttlDays ?? null,
  };
}

/**
 * R2 から user の ReadState を読み込んで normalize する canonical helper。
 *
 * 6 sites (articles/route.ts 4 箇所 + read-state/route.ts 2 箇所) で
 * `r2Get<Partial<ReadState>>(rssData, readStateKey(userId), {}).then(normalizeReadState)`
 * を inline 実装していた helper-drift を集約 (`helper-drift.md § 新規 Route Handler で
 * 既存 lib helpers を grep`)。
 *
 * 将来 ReadState 読み込み経路に per-request cache / schema versioning / migration を
 * 追加する場合、6 sites 全 edit する compile-time 保証がない状態を解消。
 */
export async function readNormalizedReadState(
  rssData: R2Bucket,
  userId: string,
): Promise<ReadState> {
  const stored = await r2Get<Partial<ReadState>>(rssData, readStateKey(userId), {});
  return normalizeReadState(stored);
}

/**
 * 2 つの `Record<string, string>` マップが構造的に等しいかを判定する純粋関数 (#686)。
 *
 * `useReadStateSyncApply` のサーバーマージ処理は、内容が変わっていなくても
 * `setState(new Object)` を呼んで reference を更新してしまう。これにより
 * `useFilteredArticles` の useMemo (`structuralFiltered` / `noteIds` Set 等) が
 * 2 秒毎に再実行されて全記事フィルター pass で 20-80ms の主スレッドブロックを発生させる。
 *
 * 本関数を setState 前のガードに使えば、内容変化なしの場合は state 更新を skip して
 * reference を保持し、useMemo の不要な再実行を回避できる。
 *
 * 等価判定:
 *   - キー集合が同じ
 *   - 各キーの値 (string) が同じ
 *
 * 実装上の注意:
 *   - O(n) ループ (snoozed は最大 500 件 / notes は最大 1,000 件の上限制約あり)
 *   - 値は string なので === で比較可
 *   - キー順序は問わない (Record なので順序は無関係)
 *
 * canonical: Map 用は `article-filter-equality.ts#equalMap<V>`、Set 用は `equalStringSet`。
 * 本関数は `Record<string, string>` 用の canonical。
 */
export function equalStringRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/** snoozedUntil マップ (`Record<articleId, ISO 8601>`) の構造的等価判定。`equalStringRecord` の意味付き alias (#686)。 */
export const equalSnoozedUntil = equalStringRecord;

/** notes マップ (`Record<articleId, noteText>`) の構造的等価判定。`equalStringRecord` の意味付き alias (#686)。 */
export const equalNotes = equalStringRecord;

/**
 * 2 つの tagIds マップが構造的に等しいかを判定する。
 *
 * tagIds は `Record<articleId, string[]>` 形式で、各記事に付いたタグの配列を保持する。
 * 等価判定は次の順:
 *   - キー集合が同じ
 *   - 各キーの string[] の長さが同じ
 *   - 各 index の文字列が === で同じ (タグ並び順も比較対象)
 *
 * 並び順を比較対象にする理由:
 *   - tagIds の order は UI で表示順として使われる
 *   - 並び替えのみ発生したケースでも setState を発火させて UI を更新したい
 *
 * O(n*m) ループ (n: 記事数、m: 平均タグ数)。tagIds は最大 2,000 記事 ×
 * 数十タグ程度なので実用上問題なし。
 */
export function equalTagIds(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const av = a[key];
    const bv = b[key];
    if (!av || !bv) return false;
    if (av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) {
      if (av[i] !== bv[i]) return false;
    }
  }
  return true;
}
