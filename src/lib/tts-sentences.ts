/**
 * TTS 読み上げハイライト用センテンス分割・charIndex 追跡の純粋関数 (#659 Phase 1)。
 *
 * Web Speech API の `onboundary` イベントで charIndex が通知される (環境依存) のと、
 * boundary が来ない環境向けの「経過時間による charIndex 推定」の両方をサポートし、
 * 案 C (両方の融合) を純粋関数として実装する。
 *
 * 案 C ロジック:
 *   - boundary が直近 (例: 500ms 以内) に来ていれば boundary の charIndex を信頼
 *   - 来ていなければ、推定 charIndex (経過時間 × WPM × rate) を採用
 *
 * DOM 統合 (sentence span ラップ・scrollIntoView・ハイライトクラス) は
 * `tts-dom.ts` / `ArticleContentBody` / `useTtsHighlight` で実装済み。
 */

/** 1 センテンス。`text` は分割後の文字列、`start`/`end` は元テキスト内の文字オフセット (end は exclusive) */
export interface Sentence {
  text: string;
  start: number;
  end: number;
}

/**
 * テキストをセンテンス単位に分割する。
 *
 * 分割条件: 句点 (`。`/`．`) / ピリオド (`.`) / 感嘆符 (`!`/`！`) / 疑問符 (`?`/`？`) の
 * いずれかが連続した直後で区切る。改行のみの空行は前のセンテンスに含めない (空テキストの
 * センテンスは生成しない)。
 *
 * デリミタは前のセンテンスに含める (TTS 読み上げ単位として自然なため)。例:
 *   "こんにちは。世界。" → [{ text: "こんにちは。", ... }, { text: "世界。", ... }]
 *
 * 末尾にデリミタがない場合は最後の残りを 1 センテンスとして含める。
 *
 * 空文字 / 空白のみ → 空配列。
 */
export function splitIntoSentences(text: string): Sentence[] {
  if (!text || !text.trim()) return [];

  const result: Sentence[] = [];
  // 句点系・ピリオド・感嘆/疑問符。連続する句読点 (例: "...!?") をまとめて 1 区切りとして扱うため + 化
  const delimiterRe = /[。．.!?！？]+/g;

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = delimiterRe.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const segment = text.slice(cursor, end);
    if (segment.trim()) {
      result.push({ text: segment, start: cursor, end });
    }
    cursor = end;
  }

  // 末尾の残り (デリミタなしで終わる場合)
  if (cursor < text.length) {
    const segment = text.slice(cursor);
    if (segment.trim()) {
      result.push({ text: segment, start: cursor, end: text.length });
    }
  }

  return result;
}

/**
 * charIndex が含まれるセンテンスのインデックスを返す。なければ -1。
 *
 * Sentence 配列は `splitIntoSentences` で生成した順 (start が昇順) を前提とする。
 * 線形探索 (センテンス数は通常 100 以下なので十分) で `start <= charIndex < end` の
 * 最初の要素を返す。
 *
 * Edge cases:
 *   - charIndex が負: 0 を返す (TTS 開始直後に boundary 来ない場合の保険)
 *   - charIndex が末尾超え: 最後のセンテンス index を返す
 *   - sentences 空: -1
 */
export function findSentenceAtCharIndex(sentences: Sentence[], charIndex: number): number {
  if (sentences.length === 0) return -1;
  if (charIndex < 0) return 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (charIndex >= s.start && charIndex < s.end) return i;
  }
  // 末尾超え (text 最終文字がデリミタで charIndex === text.length のケース)
  return sentences.length - 1;
}

/**
 * 経過時間 (ms) と読み上げ速度から、推定の charIndex を計算する。
 *
 * `boundary` イベントが来ない環境 (Chrome リモート音声 / 一部 OS の TTS エンジン) 向けの
 * fallback。日本語 200 字/分・英語 200 word/分 の感覚を「全テキスト共通で 1 文字あたり
 * baselineMsPerChar を rate で割った時間」と近似する。
 *
 * 引数:
 *   - elapsedMs: speak 開始からの経過時間
 *   - rate: utterance.rate (0.5〜2.0)
 *   - baselineMsPerChar: 1 文字あたりの ms (日本語想定で 90ms = 約 11 字/秒 ≈ 660 字/分)
 *
 * 戻り値: 推定 charIndex (非負整数)。
 */
export function estimateCharIndexByElapsed(
  elapsedMs: number,
  rate: number,
  baselineMsPerChar = 90,
): number {
  if (elapsedMs <= 0) return 0;
  if (rate <= 0) return 0;
  const msPerChar = baselineMsPerChar / rate;
  return Math.max(0, Math.floor(elapsedMs / msPerChar));
}

/**
 * 案 C: boundary イベントの charIndex と推定 charIndex を融合して採用する charIndex を選ぶ。
 *
 * - boundary が直近 (recencyMs 以内) に来ていれば boundary を信頼
 * - 来ていなければ推定値を採用
 * - boundary も推定もなければ 0
 *
 * `boundaryAt` が null = まだ一度も boundary が来ていない (または speak 直後)。
 */
export function selectActiveCharIndex(
  boundaryCharIndex: number | null,
  boundaryAt: number | null,
  estimatedCharIndex: number,
  now: number,
  recencyMs = 1500,
): number {
  if (boundaryCharIndex !== null && boundaryAt !== null && now - boundaryAt <= recencyMs) {
    return boundaryCharIndex;
  }
  return estimatedCharIndex;
}
