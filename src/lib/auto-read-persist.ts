/**
 * オートモード状態の永続化判定純粋関数 (#679 案 A)。
 *
 * autoMode フラグを `localStorage` に保存し、リロード後も
 * 「保存から N 時間以内なら自動再開」する。N 時間超過なら自動的に OFF 扱い。
 */

/** 既定の有効期限 (ms): 1 時間。ユーザー要望に基づく値 (#679)。 */
export const AUTO_READ_RESUME_TTL_MS = 60 * 60 * 1000;

export interface PersistedAutoReadState {
  /** 永続化された autoMode の値 (true で ON 状態を継続) */
  enabled: boolean;
  /** 保存された UNIX ミリ秒タイムスタンプ */
  savedAt: number;
}

/**
 * `localStorage` から取得した raw 文字列をパースする。
 *
 * - `null` / 空文字 / 不正 JSON / 構造不一致 → null
 * - enabled が boolean でない / savedAt が数値でない → null
 */
export function parsePersistedAutoReadState(raw: string | null): PersistedAutoReadState | null {
  if (raw == null || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.enabled !== "boolean") return null;
  if (typeof obj.savedAt !== "number" || !Number.isFinite(obj.savedAt)) return null;
  return { enabled: obj.enabled, savedAt: obj.savedAt };
}

/**
 * 永続化された状態と現在時刻から、リロード後の autoMode 初期値を判定する。
 *
 * 復元条件:
 * - state が存在
 * - state.enabled === true
 * - 経過時間 (now - savedAt) が `ttlMs` 未満
 * - 経過時間が **負でない** (時計戻り防止)
 *
 * 上記いずれかを満たさなければ false を返す (= OFF で起動)。
 */
export function shouldRestoreAutoMode(
  state: PersistedAutoReadState | null,
  now: number,
  ttlMs: number = AUTO_READ_RESUME_TTL_MS,
): boolean {
  if (!state) return false;
  if (!state.enabled) return false;
  const elapsed = now - state.savedAt;
  if (elapsed < 0) return false; // 時計戻りで未来の savedAt → 復元しない
  if (elapsed >= ttlMs) return false; // 期限超過
  return true;
}

/** 保存用の serialized 文字列を生成する純粋関数 (`now` を引数に取って testable に)。 */
export function serializeAutoReadState(enabled: boolean, now: number): string {
  return JSON.stringify({ enabled, savedAt: now } satisfies PersistedAutoReadState);
}
