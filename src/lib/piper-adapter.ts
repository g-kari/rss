/**
 * Piper TTS wasm engine (`@mintplex-labs/piper-tts-web`) を抽象 TTS adapter で扱うための
 * mapping 純粋関数集 (#674 Phase 2a-part1)。
 *
 * Phase 0 で定義した `TtsAdapter` / `TtsVoice` 型と整合する形で、Piper の voiceId
 * (HuggingFace の Piper voice naming convention) を抽象 `TtsVoice` に変換する。
 *
 * Piper voiceId の命名規則 (HuggingFace: `https://huggingface.co/rhasspy/piper-voices`):
 *   `<lang>-<name>-<quality>`
 *   - lang: BCP 47 風だが区切りは `_` (例: `en_US`, `ja_JP`, `de_DE`)
 *   - name: voice 固有名 (例: `amy`, `ryan`, `tsukuyomi`)
 *   - quality: `x_low` / `low` / `medium` / `high` のいずれか
 *
 * 例: `en_US-amy-medium`, `ja_JP-tsukuyomi-medium`, `de_DE-thorsten-low`
 *
 * Phase 2a-part2 (別サイクル) では本ファイルを使う `usePiperTts.ts` hook を実装し、
 * `TtsAdapter` interface を満たす engine として AppProviders から差し替え可能にする。
 */

import type { TtsVoice } from "./tts-adapter";

/** Piper voice quality enum (HuggingFace ファイル名の suffix に対応)。 */
const PIPER_QUALITIES = new Set(["x_low", "low", "medium", "high"]);

/**
 * Piper voiceId を `<lang>-<name>-<quality>` 形式として parse する。
 *
 * - `quality` は末尾 token (必ず `x_low` / `low` / `medium` / `high` のいずれか)
 * - `name` は末尾から 2 番目の token
 * - `lang` は残り (`lang` 部に `_` は含むが `-` は含まない前提)
 *
 * 想定外の形式は null を返す (consumer は null を skip / fallback)。
 */
export function parsePiperVoiceId(
  voiceId: string,
): { lang: string; name: string; quality: string } | null {
  if (!voiceId) return null;
  const parts = voiceId.split("-");
  if (parts.length < 3) return null;
  const quality = parts[parts.length - 1];
  if (!PIPER_QUALITIES.has(quality)) return null;
  const name = parts[parts.length - 2];
  const lang = parts.slice(0, -2).join("-");
  if (!lang || !name) return null;
  return { lang, name, quality };
}

/**
 * Piper voiceId を UI 表示用の voice 名にフォーマットする。
 *
 * 例: `en_US-amy-medium` → `"Amy (Piper medium)"`
 *
 * - voice name は capitalize (`amy` → `Amy`)
 * - quality は parens 内に明示 (Web Speech voice と区別 + 品質選択可能性を示唆)
 */
export function formatPiperVoiceName(parsed: { name: string; quality: string }): string {
  const capitalized = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
  return `${capitalized} (Piper ${parsed.quality})`;
}

/**
 * Piper の `lang` (`en_US` 等の HuggingFace 形式) を BCP 47 (`en-US`) に変換する。
 *
 * `tts-adapter.ts` の `TtsVoice.lang` は BCP 47 を期待するため必須の変換。
 */
export function piperLangToBcp47(piperLang: string): string {
  return piperLang.replace(/_/g, "-");
}

/**
 * Piper voiceId を抽象 `TtsVoice` に変換する。形式不正 / 未知の quality は null。
 *
 * - `voiceURI` には `piper:<voiceId>` prefix を付与し、Web Speech voice (URI が url 形式)
 *   と区別する。setVoiceUri 受信時に prefix で engine 判定可能。
 * - `default` は常に false (Piper engine はデフォルト voice を概念として持たない、
 *   ユーザーが明示的に DL したものから選択する設計)
 */
export function piperVoiceToTtsVoice(voiceId: string): TtsVoice | null {
  const parsed = parsePiperVoiceId(voiceId);
  if (!parsed) return null;
  return {
    voiceURI: `piper:${voiceId}`,
    name: formatPiperVoiceName(parsed),
    lang: piperLangToBcp47(parsed.lang),
    default: false,
  };
}
