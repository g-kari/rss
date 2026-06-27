import type { Feed } from "../types";

/**
 * モジュールレベル共有 sentinel オブジェクト (#1164)。
 *
 * `react-state-ref.md § 派生「モジュールレベル sentinel オブジェクトは Object.freeze で
 * 下流汚染を防ぐ」` 規範対象。複数 hook で同 sentinel を共有することで:
 *
 * - reference identity を統一して cross-hook 経由の `Object.is` skip を確実化
 * - `Object.freeze` で `.add()` / `.push()` による sentinel 汚染を runtime safety net で防御
 * - 将来 `EMPTY_NUMBER_ARRAY` / `EMPTY_MAP` 等の sentinel 追加時の集約点
 *
 * 型注釈は元の mutable (`Set<string>` / `string[]` / `Feed[]`) のまま (`as cast`) で
 * consumer 側の型変更を要求しない。`ReadonlySet` / `ReadonlyArray` 派にしたい新規モジュール
 * では別途 type-side 設計を検討。
 */
export const EMPTY_STRING_SET = Object.freeze(new Set<string>()) as Set<string>;

export const EMPTY_STRING_ARRAY = Object.freeze([] as string[]) as string[];

export const EMPTY_FEED_ARRAY = Object.freeze([] as Feed[]) as Feed[];
