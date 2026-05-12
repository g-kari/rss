/**
 * piper-adapter spec (#674 Phase 2a-part1)
 *
 * Piper voiceId (HuggingFace の Piper voice naming convention) を抽象 TtsVoice に
 * 変換する純粋関数群の TDD 仕様。`tts-adapter.ts` で定義済の TtsVoice 型と互換性を担保。
 */
import { describe, it, expect } from "vitest";
import {
  parsePiperVoiceId,
  formatPiperVoiceName,
  piperLangToBcp47,
  piperVoiceToTtsVoice,
} from "./piper-adapter";

describe("parsePiperVoiceId", () => {
  it("英語 medium voice を parse する", () => {
    expect(parsePiperVoiceId("en_US-amy-medium")).toEqual({
      lang: "en_US",
      name: "amy",
      quality: "medium",
    });
  });

  it("日本語 medium voice (つくよみちゃん) を parse する", () => {
    expect(parsePiperVoiceId("ja_JP-tsukuyomi-medium")).toEqual({
      lang: "ja_JP",
      name: "tsukuyomi",
      quality: "medium",
    });
  });

  it("low / high / x_low quality も認識する", () => {
    expect(parsePiperVoiceId("de_DE-thorsten-low")?.quality).toBe("low");
    expect(parsePiperVoiceId("en_GB-alan-high")?.quality).toBe("high");
    expect(parsePiperVoiceId("ar_JO-kareem-x_low")?.quality).toBe("x_low");
  });

  it("未知の quality は null", () => {
    expect(parsePiperVoiceId("en_US-amy-ultra")).toBeNull();
    expect(parsePiperVoiceId("en_US-amy-x_high")).toBeNull();
  });

  it("3 part 未満は null", () => {
    expect(parsePiperVoiceId("amy")).toBeNull();
    expect(parsePiperVoiceId("en_US-amy")).toBeNull();
  });

  it("空文字 / 不正形式は null", () => {
    expect(parsePiperVoiceId("")).toBeNull();
    expect(parsePiperVoiceId("--medium")).toBeNull();
  });
});

describe("formatPiperVoiceName", () => {
  it("voice name を capitalize して quality を併記する", () => {
    expect(formatPiperVoiceName({ name: "amy", quality: "medium" })).toBe("Amy (Piper medium)");
    expect(formatPiperVoiceName({ name: "tsukuyomi", quality: "medium" })).toBe(
      "Tsukuyomi (Piper medium)",
    );
    expect(formatPiperVoiceName({ name: "thorsten", quality: "low" })).toBe("Thorsten (Piper low)");
  });
});

describe("piperLangToBcp47", () => {
  it("`_` を `-` に変換", () => {
    expect(piperLangToBcp47("en_US")).toBe("en-US");
    expect(piperLangToBcp47("ja_JP")).toBe("ja-JP");
    expect(piperLangToBcp47("zh_CN")).toBe("zh-CN");
  });

  it("`_` が無ければそのまま", () => {
    expect(piperLangToBcp47("en")).toBe("en");
  });
});

describe("piperVoiceToTtsVoice", () => {
  it("正常 voiceId → TtsVoice", () => {
    expect(piperVoiceToTtsVoice("en_US-amy-medium")).toEqual({
      voiceURI: "piper:en_US-amy-medium",
      name: "Amy (Piper medium)",
      lang: "en-US",
      default: false,
    });
  });

  it("つくよみちゃん voiceId → TtsVoice (#674 メインターゲット)", () => {
    expect(piperVoiceToTtsVoice("ja_JP-tsukuyomi-medium")).toEqual({
      voiceURI: "piper:ja_JP-tsukuyomi-medium",
      name: "Tsukuyomi (Piper medium)",
      lang: "ja-JP",
      default: false,
    });
  });

  it("voiceURI に `piper:` prefix が付く (Web Speech voice と区別)", () => {
    const v = piperVoiceToTtsVoice("en_US-amy-medium");
    expect(v?.voiceURI.startsWith("piper:")).toBe(true);
  });

  it("不正 voiceId は null (Web Speech と混在しても skip 可能)", () => {
    expect(piperVoiceToTtsVoice("invalid")).toBeNull();
    expect(piperVoiceToTtsVoice("en_US-amy")).toBeNull();
    expect(piperVoiceToTtsVoice("en_US-amy-unknownquality")).toBeNull();
  });
});
