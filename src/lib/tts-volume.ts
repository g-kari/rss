/**
 * TTS 音量設定の純粋関数 (#699)。
 *
 * Web Speech API の `SpeechSynthesisUtterance.volume` は 0.0〜1.0 の範囲を取り、
 * 範囲外を渡した場合のブラウザ挙動は仕様未定義 (Chrome は clamp、Safari は無視)。
 * 設定値は localStorage 経由で文字列として永続化されるため、不正値 / 範囲外を
 * 復元時に安全にデフォルト (1.0 = 100%) へフォールバックする責務を担う。
 *
 * UI 側は 0〜100 の整数値スライダーで扱い、内部は 0.0〜1.0 の float に変換する。
 * 0 (= ミュート) も valid な値として扱う (Web Speech API も 0 を受理する)。
 */

/** Web Speech API の `SpeechSynthesisUtterance.volume` 範囲 */
export const TTS_VOLUME_MIN = 0.0;
export const TTS_VOLUME_MAX = 1.0;
export const TTS_VOLUME_DEFAULT = 1.0;

/**
 * 任意の数値・文字列を `[0.0, 1.0]` 範囲の音量にクランプする。
 *
 * - `NaN` / `Infinity` / `-Infinity` / 文字列 / null / undefined → デフォルト (1.0)
 * - 範囲外の有限数 (-0.5 / 1.5 等) → 範囲内に clamp
 * - 範囲内の有限数 → そのまま
 *
 * 戻り値は常に `[0.0, 1.0]` の有限数なので、`SpeechSynthesisUtterance.volume`
 * に直接代入して安全。
 */
export function clampTtsVolume(value: unknown): number {
  if (typeof value !== "number") return TTS_VOLUME_DEFAULT;
  if (!Number.isFinite(value)) return TTS_VOLUME_DEFAULT;
  if (value < TTS_VOLUME_MIN) return TTS_VOLUME_MIN;
  if (value > TTS_VOLUME_MAX) return TTS_VOLUME_MAX;
  return value;
}

/**
 * localStorage に保存された文字列から音量を復元する。
 *
 * - 数値文字列 ("0.5" 等) → parseFloat → clamp
 * - 不正文字列 / 空文字 / null → デフォルト (1.0)
 *
 * `clampTtsVolume(parseFloat(...))` のショートハンドだが、`storageGet` から
 * 直接呼び出す箇所が複数になる場合の重複排除のために提供する。
 */
export function parseTtsVolume(stored: string | null | undefined): number {
  if (!stored) return TTS_VOLUME_DEFAULT;
  const parsed = parseFloat(stored);
  return clampTtsVolume(parsed);
}
