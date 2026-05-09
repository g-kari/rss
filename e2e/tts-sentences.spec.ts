import { test, expect } from "@playwright/test";
import {
  splitIntoSentences,
  findSentenceAtCharIndex,
  estimateCharIndexByElapsed,
  selectActiveCharIndex,
} from "../src/lib/tts-sentences";

/**
 * #659 Phase 1 — TTS sentence tracking 純粋関数の単体テスト。
 *
 * splitIntoSentences / findSentenceAtCharIndex / estimateCharIndexByElapsed /
 * selectActiveCharIndex の 4 関数の全分岐を網羅する。
 */

// ============================================================
// splitIntoSentences
// ============================================================

test.describe("splitIntoSentences — 句点系で分割", () => {
  test("空文字は空配列", () => {
    expect(splitIntoSentences("")).toEqual([]);
  });

  test("空白のみは空配列", () => {
    expect(splitIntoSentences("   \n   ")).toEqual([]);
  });

  test("日本語句点で分割し、デリミタは前文に含める", () => {
    const result = splitIntoSentences("こんにちは。世界。");
    expect(result).toEqual([
      { text: "こんにちは。", start: 0, end: 6 },
      { text: "世界。", start: 6, end: 9 },
    ]);
  });

  test("英語ピリオドで分割", () => {
    const result = splitIntoSentences("Hello. World.");
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Hello.");
    expect(result[1].text.trim()).toBe("World.");
  });

  test("感嘆符・疑問符でも分割", () => {
    const result = splitIntoSentences("本当！？すごい。");
    // "本当！？" + "すごい。" の 2 センテンス (連続デリミタは 1 区切りとして扱う)
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("本当！？");
    expect(result[1].text).toBe("すごい。");
  });

  test("末尾デリミタなしでも 1 センテンスとして含める", () => {
    const result = splitIntoSentences("これは未完文");
    expect(result).toEqual([{ text: "これは未完文", start: 0, end: 6 }]);
  });

  test("デリミタなし + デリミタあり混在", () => {
    const result = splitIntoSentences("最初の文。続きの文");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: "最初の文。", start: 0, end: 5 });
    expect(result[1]).toEqual({ text: "続きの文", start: 5, end: 9 });
  });

  test("start/end が cumulative で連続している (隙間なし)", () => {
    const result = splitIntoSentences("A。B。C。");
    expect(result.map((s) => [s.start, s.end])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
    ]);
  });

  test("半角/全角ピリオドの混在も区切る", () => {
    const result = splitIntoSentences("文 1．文 2.文 3。");
    expect(result).toHaveLength(3);
  });
});

// ============================================================
// findSentenceAtCharIndex
// ============================================================

test.describe("findSentenceAtCharIndex — charIndex から sentence index を引く", () => {
  const sentences = splitIntoSentences("最初の文。続きの文。最後の文。");
  // [0,5)=最初の文。 [5,10)=続きの文。 [10,15)=最後の文。

  test("空配列なら -1", () => {
    expect(findSentenceAtCharIndex([], 0)).toBe(-1);
  });

  test("charIndex 負数なら 0 (TTS 開始直後の保険)", () => {
    expect(findSentenceAtCharIndex(sentences, -1)).toBe(0);
  });

  test("第 1 センテンス内の charIndex", () => {
    expect(findSentenceAtCharIndex(sentences, 0)).toBe(0);
    expect(findSentenceAtCharIndex(sentences, 4)).toBe(0);
  });

  test("第 2 センテンス内の charIndex", () => {
    expect(findSentenceAtCharIndex(sentences, 5)).toBe(1);
    expect(findSentenceAtCharIndex(sentences, 9)).toBe(1);
  });

  test("第 3 センテンス内の charIndex", () => {
    expect(findSentenceAtCharIndex(sentences, 10)).toBe(2);
    expect(findSentenceAtCharIndex(sentences, 14)).toBe(2);
  });

  test("末尾超え (charIndex === text.length) は最後の sentence", () => {
    expect(findSentenceAtCharIndex(sentences, 100)).toBe(2);
  });
});

// ============================================================
// estimateCharIndexByElapsed
// ============================================================

test.describe("estimateCharIndexByElapsed — 経過時間から charIndex 推定", () => {
  test("elapsedMs=0 → 0", () => {
    expect(estimateCharIndexByElapsed(0, 1.0)).toBe(0);
  });

  test("elapsedMs 負数 → 0", () => {
    expect(estimateCharIndexByElapsed(-100, 1.0)).toBe(0);
  });

  test("rate=1.0, baseline=90ms/char で 900ms 経過 → 10 文字", () => {
    expect(estimateCharIndexByElapsed(900, 1.0, 90)).toBe(10);
  });

  test("rate=2.0 で速度 2 倍 → 同 elapsed で 2 倍進む", () => {
    expect(estimateCharIndexByElapsed(900, 2.0, 90)).toBe(20);
  });

  test("rate=0.5 で速度 1/2 → 同 elapsed で半分しか進まない", () => {
    expect(estimateCharIndexByElapsed(900, 0.5, 90)).toBe(5);
  });

  test("rate <= 0 は 0 返却 (除算保護)", () => {
    expect(estimateCharIndexByElapsed(1000, 0)).toBe(0);
    expect(estimateCharIndexByElapsed(1000, -1)).toBe(0);
  });

  test("baselineMsPerChar カスタム指定 (英語想定 60ms/char)", () => {
    expect(estimateCharIndexByElapsed(600, 1.0, 60)).toBe(10);
  });
});

// ============================================================
// selectActiveCharIndex (案 C 融合)
// ============================================================

test.describe("selectActiveCharIndex — boundary と推定の融合 (案 C)", () => {
  test("boundary が直近に来ていれば boundary を採用", () => {
    // boundaryAt=1000, now=1500 (差 500ms < recencyMs=1500)
    expect(selectActiveCharIndex(50, 1000, 99, 1500, 1500)).toBe(50);
  });

  test("boundary が古ければ推定値にフォールバック", () => {
    // boundaryAt=1000, now=3000 (差 2000ms > recencyMs=1500)
    expect(selectActiveCharIndex(50, 1000, 99, 3000, 1500)).toBe(99);
  });

  test("boundary が一度も来てなければ推定値", () => {
    expect(selectActiveCharIndex(null, null, 42, 5000)).toBe(42);
  });

  test("boundary 来てるが boundaryAt が null なら推定値", () => {
    expect(selectActiveCharIndex(50, null, 42, 5000)).toBe(42);
  });

  test("boundary も推定も 0 なら 0", () => {
    expect(selectActiveCharIndex(null, null, 0, 1000)).toBe(0);
  });

  test("recencyMs ちょうどの境界は inclusive で boundary 採用", () => {
    // diff = recencyMs ちょうど → boundary 採用 (<=)
    expect(selectActiveCharIndex(50, 1000, 99, 2500, 1500)).toBe(50);
  });

  test("boundaryCharIndex=0 (先頭センテンス) も有効値として扱う", () => {
    expect(selectActiveCharIndex(0, 1000, 50, 1500, 1500)).toBe(0);
  });
});
