import { test, expect } from "@playwright/test";
import { selectTtsVoice, groupVoicesByLang, type VoiceLike } from "../src/lib/tts-voice";

/**
 * `selectTtsVoice` / `groupVoicesByLang` の単体テスト (#654)。
 *
 * Web Speech API の SpeechSynthesisVoice 選択ロジックを、ブラウザ非依存の
 * 部分型 VoiceLike でテストする。
 */

const VOICES: VoiceLike[] = [
  { voiceURI: "ja-JP-1", lang: "ja-JP", name: "Kyoko" },
  { voiceURI: "ja-JP-2", lang: "ja-JP", name: "Otoya", default: true },
  { voiceURI: "en-US-1", lang: "en-US", name: "Alex" },
  { voiceURI: "en-US-2", lang: "en-US", name: "Samantha" },
  { voiceURI: "en-GB-1", lang: "en-GB", name: "Daniel" },
  { voiceURI: "fr-FR-1", lang: "fr-FR", name: "Thomas" },
];

// ============================================================
// selectTtsVoice
// ============================================================

test.describe("selectTtsVoice — 優先順位", () => {
  test("preferredUri 完全一致が最優先", () => {
    const result = selectTtsVoice(VOICES, "en-US-1", "ja-JP");
    expect(result?.voiceURI).toBe("en-US-1");
  });

  test("preferredUri が一致しない場合は言語前方一致", () => {
    const result = selectTtsVoice(VOICES, "missing-uri", "ja-JP");
    expect(result?.lang).toBe("ja-JP");
  });

  test("documentLang 前方一致 (ja は ja-JP にマッチ)", () => {
    const result = selectTtsVoice(VOICES, null, "ja");
    expect(result?.lang).toBe("ja-JP");
  });

  test("documentLang 前方一致 (en は en-US/en-GB どちらかにマッチ)", () => {
    const result = selectTtsVoice(VOICES, null, "en");
    expect(result?.lang.startsWith("en")).toBe(true);
  });

  test("documentLang マッチなければ default フラグ voice", () => {
    const result = selectTtsVoice(VOICES, null, "de-DE");
    expect(result?.voiceURI).toBe("ja-JP-2"); // default: true
  });

  test("default なし・マッチなしなら先頭", () => {
    const noDefault = VOICES.map((v) => ({ ...v, default: false }));
    const result = selectTtsVoice(noDefault, null, "de-DE");
    expect(result?.voiceURI).toBe("ja-JP-1");
  });

  test("空配列なら null", () => {
    expect(selectTtsVoice([], "any", "ja")).toBeNull();
  });

  test("preferredUri null + documentLang null + default なしなら先頭", () => {
    const noDefault = VOICES.map((v) => ({ ...v, default: false }));
    const result = selectTtsVoice(noDefault, null, null);
    expect(result?.voiceURI).toBe("ja-JP-1");
  });

  test("preferredUri 空文字は無効として扱う", () => {
    const result = selectTtsVoice(VOICES, "", "ja-JP");
    expect(result?.lang).toBe("ja-JP"); // 言語マッチに進む
  });

  test("documentLang の大文字小文字差異を吸収 (JA-JP / ja-jp 等)", () => {
    const result = selectTtsVoice(VOICES, null, "JA-JP");
    expect(result?.lang).toBe("ja-JP");
  });

  test("documentLang の完全一致を同一言語の前方一致より優先する", () => {
    const voices: VoiceLike[] = [
      { voiceURI: "en-GB", lang: "en-GB", name: "British" },
      { voiceURI: "en-US", lang: "en-US", name: "American" },
    ];
    const result = selectTtsVoice(voices, null, "en-US");
    expect(result?.voiceURI).toBe("en-US");
  });
});

// ============================================================
// groupVoicesByLang
// ============================================================

test.describe("groupVoicesByLang — 言語別グループ化", () => {
  test("言語前方プレフィックスでグルーピング", () => {
    const groups = groupVoicesByLang(VOICES, null);
    const langs = groups.map((g) => g.lang);
    // ja, en, fr の 3 グループ (ja-JP は ja に集約、en-US/en-GB は en に集約)
    expect(langs).toEqual(["en", "fr", "ja"]);
  });

  test("各グループ内は name 昇順", () => {
    const groups = groupVoicesByLang(VOICES, null);
    const enGroup = groups.find((g) => g.lang === "en")!;
    expect(enGroup.voices.map((v) => v.name)).toEqual(["Alex", "Daniel", "Samantha"]);
  });

  test("preferredLangPrefix 指定時は該当グループを先頭に", () => {
    const groups = groupVoicesByLang(VOICES, "ja");
    expect(groups[0].lang).toBe("ja");
    expect(groups.slice(1).map((g) => g.lang)).toEqual(["en", "fr"]);
  });

  test("preferredLangPrefix が存在しないグループでも崩れない", () => {
    const groups = groupVoicesByLang(VOICES, "de");
    expect(groups.map((g) => g.lang)).toEqual(["en", "fr", "ja"]);
  });

  test("空配列は空配列", () => {
    expect(groupVoicesByLang([], null)).toEqual([]);
  });

  test("lang が空文字の voice は '?' グループに入る", () => {
    const result = groupVoicesByLang(
      [{ voiceURI: "x", lang: "", name: "Anonymous" }] as VoiceLike[],
      null,
    );
    expect(result).toEqual([
      { lang: "?", voices: [{ voiceURI: "x", lang: "", name: "Anonymous" }] },
    ]);
  });
});
