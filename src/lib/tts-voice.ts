/**
 * Web Speech API の SpeechSynthesisVoice 選択ロジック純粋関数 (#654)。
 *
 * `window.speechSynthesis.getVoices()` の結果から、ユーザー優先 voice / 言語マッチ /
 * fallback の優先順位で選択する。
 *
 * SpeechSynthesisVoice はブラウザ依存の構造を持つが、本関数は最小限の
 * `voiceURI` / `lang` プロパティに依存するため、テストでは部分型でモック可能。
 */

/** テスト容易性のため SpeechSynthesisVoice の必要プロパティだけを抜き出した部分型 */
export interface VoiceLike {
  voiceURI: string;
  lang: string;
  name: string;
  default?: boolean;
}

function languagePrefix(lang: string): string {
  return lang.toLowerCase().split("-")[0] ?? "";
}

/**
 * 利用可能な voice 配列から、優先順位に従って 1 件選択する。
 *
 * 優先順位 (高→低):
 *   1. preferredUri と完全一致する voice
 *   2. document の言語タグと完全一致する voice (例: "en-US" は "en-US" を優先)
 *   3. document の言語タグと前方一致する voice (例: "ja" は "ja-JP" にマッチ)
 *   4. default フラグが立っている voice
 *   5. 配列の先頭
 *   6. 空配列なら null
 *
 * 言語マッチは前方一致 (両側を lowercase + ハイフン以前で比較) で寛容に行う:
 *   "ja-JP" と "ja" → match
 *   "en-US" と "en" → match
 *   "en-US" と "en-GB" → match (どちらも "en")
 *   "ja-JP" と "en" → no match
 */
export function selectTtsVoice<T extends VoiceLike>(
  voices: T[],
  preferredUri: string | null | undefined,
  documentLang: string | null | undefined,
): T | null {
  if (voices.length === 0) return null;

  // 1. preferredUri 完全一致
  if (preferredUri) {
    const found = voices.find((v) => v.voiceURI === preferredUri);
    if (found) return found;
  }

  // 2. 完全な言語タグ一致（地域に合う voice を優先）
  if (documentLang) {
    const normalizedDocumentLang = documentLang.toLowerCase();
    const exactMatch = voices.find((v) => v.lang.toLowerCase() === normalizedDocumentLang);
    if (exactMatch) return exactMatch;

    // 3. 言語前方一致
    const docPrefix = languagePrefix(documentLang);
    const langMatch = voices.find((v) => {
      const voicePrefix = languagePrefix(v.lang);
      return voicePrefix === docPrefix;
    });
    if (langMatch) return langMatch;
  }

  // 4. default フラグ
  const defaultVoice = voices.find((v) => v.default === true);
  if (defaultVoice) return defaultVoice;

  // 5. 先頭
  return voices[0];
}

/**
 * 利用可能な voice 配列を「言語ごと」にグループ化して UI selector に渡しやすい形にする。
 *
 * 戻り値は `Map<lang prefix, voices[]>` (e.g., "ja" → [...JP voices], "en" → [...EN voices])。
 * 言語キーは `lang.toLowerCase().split("-")[0]` で正規化する (ja-JP / ja-Hira → "ja" にまとめる)。
 *
 * 各グループ内の voice は `name` で昇順ソート。グループ自体は preferredLangPrefix を先頭、
 * その他は言語キーアルファベット順。
 */
export function groupVoicesByLang<T extends VoiceLike>(
  voices: T[],
  preferredLangPrefix?: string | null,
): Array<{ lang: string; voices: T[] }> {
  const map = new Map<string, T[]>();
  for (const v of voices) {
    const key = languagePrefix(v.lang) || "?";
    const arr = map.get(key) ?? [];
    arr.push(v);
    map.set(key, arr);
  }
  // 各グループを name 昇順
  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  // グループの順序: preferredLangPrefix を先頭 → 残りはアルファベット順
  const langs = Array.from(map.keys()).sort();
  const preferred = preferredLangPrefix ? languagePrefix(preferredLangPrefix) : undefined;
  if (preferred && map.has(preferred)) {
    const idx = langs.indexOf(preferred);
    langs.splice(idx, 1);
    langs.unshift(preferred);
  }
  return langs.map((lang) => ({ lang, voices: map.get(lang)! }));
}
