import { test, expect } from "@playwright/test";
import {
  TTS_SILENT_SKIP_ERRORS,
  formatTtsErrorMessage,
  normalizeWebSpeechError,
  speechSynthesisVoiceToTtsVoice,
  type TtsVoice,
  type TtsAdapter,
  type TtsEngineId,
  type TtsErrorCode,
} from "../src/lib/tts-adapter";
import { selectTtsVoice, groupVoicesByLang } from "../src/lib/tts-voice";

test.describe("speechSynthesisVoiceToTtsVoice", () => {
  test("voiceURI / name / lang を持つオブジェクトを TtsVoice に変換", () => {
    const result = speechSynthesisVoiceToTtsVoice({
      voiceURI: "Microsoft Ayumi - Japanese (Japan)",
      name: "Ayumi",
      lang: "ja-JP",
      default: true,
    });
    expect(result).toEqual({
      voiceURI: "Microsoft Ayumi - Japanese (Japan)",
      name: "Ayumi",
      lang: "ja-JP",
      default: true,
    });
  });

  test("default フラグが省略されたら undefined のまま保持", () => {
    const result = speechSynthesisVoiceToTtsVoice({
      voiceURI: "uri-1",
      name: "Sample",
      lang: "en-US",
    });
    expect(result.default).toBeUndefined();
  });

  test("Web Speech 固有の追加フィールドは無視される (構造的に最小化)", () => {
    const sourceWithExtras = {
      voiceURI: "uri-1",
      name: "Sample",
      lang: "en-US",
      default: false,
      // SpeechSynthesisVoice にあるが TtsVoice にはない field (例)
      localService: true,
    } as unknown as Parameters<typeof speechSynthesisVoiceToTtsVoice>[0];
    const result = speechSynthesisVoiceToTtsVoice(sourceWithExtras);
    expect("localService" in result).toBe(false);
  });
});

test.describe("TtsVoice と既存 selectTtsVoice / groupVoicesByLang の互換性", () => {
  // 既存の純粋関数は VoiceLike 部分型 (voiceURI / name / lang / default) で動作するため、
  // TtsVoice はそのまま VoiceLike として使える。これを TS 型と実行時の両方で確認する。

  const sample: TtsVoice[] = [
    { voiceURI: "ja-1", name: "日本語1", lang: "ja-JP", default: true },
    { voiceURI: "ja-2", name: "日本語2", lang: "ja-JP" },
    { voiceURI: "en-1", name: "English", lang: "en-US" },
  ];

  test("selectTtsVoice が TtsVoice 配列を受けて動作する", () => {
    const ja = selectTtsVoice(sample, null, "ja-JP");
    expect(ja?.voiceURI).toBe("ja-1");
  });

  test("groupVoicesByLang が TtsVoice 配列を受けて言語別にグループ化する", () => {
    const groups = groupVoicesByLang(sample, "ja");
    expect(groups[0].lang).toBe("ja"); // preferredLangPrefix が先頭
    expect(groups[0].voices).toHaveLength(2);
    expect(groups[1].lang).toBe("en");
  });
});

test.describe("TtsAdapter 型契約", () => {
  // 型レベル契約のスモークテスト: dummy 実装が TtsAdapter を満たすか
  test("最小実装で TtsAdapter インターフェース要件を満たすことができる", () => {
    const dummy: TtsAdapter = {
      engine: "web-speech" as TtsEngineId,
      supported: false,
      isPlaying: false,
      isPaused: false,
      endedCount: 0,
      errorCount: 0,
      lastError: null,
      rate: 1.0,
      cycleRate: () => 1.0,
      volume: 1.0,
      setVolume: () => {},
      voices: [],
      voiceUri: null,
      setVoiceUri: () => {},
      speak: () => {},
      pause: () => {},
      resume: () => {},
      stop: () => {},
    };
    expect(dummy.engine).toBe("web-speech");
    expect(dummy.supported).toBe(false);
    expect(dummy.voices).toEqual([]);
  });

  test("piper engine も engine 識別子として許容する", () => {
    const piperEngine: TtsEngineId = "piper";
    expect(piperEngine).toBe("piper");
  });
});

test.describe("TtsErrorCode 正規化と文言マッピング (#756)", () => {
  test("normalizeWebSpeechError は既知の SpeechSynthesisErrorCode をそのまま返す", () => {
    const knownCodes: TtsErrorCode[] = [
      "canceled",
      "interrupted",
      "audio-busy",
      "not-allowed",
      "language-unavailable",
      "voice-unavailable",
      "synthesis-failed",
      "audio-hardware",
      "network",
    ];
    for (const code of knownCodes) {
      expect(normalizeWebSpeechError(code)).toBe(code);
    }
  });

  test("normalizeWebSpeechError は未知の値を 'unknown' に fallback", () => {
    expect(normalizeWebSpeechError("invalid-argument")).toBe("unknown");
    expect(normalizeWebSpeechError("")).toBe("unknown");
    expect(normalizeWebSpeechError("future-error-code")).toBe("unknown");
  });

  test("TTS_SILENT_SKIP_ERRORS は canceled / interrupted / audio-busy を含む", () => {
    expect(TTS_SILENT_SKIP_ERRORS.has("canceled")).toBe(true);
    expect(TTS_SILENT_SKIP_ERRORS.has("interrupted")).toBe(true);
    expect(TTS_SILENT_SKIP_ERRORS.has("audio-busy")).toBe(true);
    expect(TTS_SILENT_SKIP_ERRORS.size).toBe(3);
  });

  test("TTS_SILENT_SKIP_ERRORS は toast 通知すべき error を含まない", () => {
    const shouldNotify: TtsErrorCode[] = [
      "not-allowed",
      "language-unavailable",
      "voice-unavailable",
      "synthesis-failed",
      "audio-hardware",
      "network",
      "model-error",
      "unknown",
    ];
    for (const code of shouldNotify) {
      expect(TTS_SILENT_SKIP_ERRORS.has(code)).toBe(false);
    }
  });

  test("formatTtsErrorMessage は null / silent skip error で null を返す", () => {
    expect(formatTtsErrorMessage(null)).toBeNull();
    expect(formatTtsErrorMessage("canceled")).toBeNull();
    expect(formatTtsErrorMessage("interrupted")).toBeNull();
    expect(formatTtsErrorMessage("audio-busy")).toBeNull();
  });

  test("formatTtsErrorMessage は通知対象 error で非 null の文言を返す", () => {
    const shouldNotify: TtsErrorCode[] = [
      "not-allowed",
      "language-unavailable",
      "voice-unavailable",
      "synthesis-failed",
      "audio-hardware",
      "network",
      "model-error",
      "unknown",
    ];
    for (const code of shouldNotify) {
      const msg = formatTtsErrorMessage(code);
      expect(msg).not.toBeNull();
      expect(typeof msg).toBe("string");
      expect(msg!.length).toBeGreaterThan(0);
    }
  });

  test("formatTtsErrorMessage の文言は error 種別ごとに異なる (重複なし)", () => {
    const shouldNotify: TtsErrorCode[] = [
      "not-allowed",
      "language-unavailable",
      "voice-unavailable",
      "synthesis-failed",
      "audio-hardware",
      "network",
      "model-error",
      "unknown",
    ];
    const messages = shouldNotify.map((c) => formatTtsErrorMessage(c));
    const uniqueMessages = new Set(messages);
    expect(uniqueMessages.size).toBe(messages.length);
  });

  test("formatTtsErrorMessage('voice-unavailable') は自動 reset を示唆する文言", () => {
    const msg = formatTtsErrorMessage("voice-unavailable");
    expect(msg).toMatch(/自動選択に戻/);
  });

  test("formatTtsErrorMessage('language-unavailable') は voice 選択 UI 誘導を示唆", () => {
    const msg = formatTtsErrorMessage("language-unavailable");
    expect(msg).toMatch(/設定|Voice|voice/);
  });
});
