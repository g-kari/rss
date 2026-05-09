/**
 * オートモード（自動全文取得 → 読み上げ → 次の記事へ）の判定純粋関数。
 *
 * UI 副作用と切り離してテスト可能にするため、状態遷移の判定だけを担う。
 */

/** ブラウザの SpeechSynthesis API が利用可能か */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface AutoReadAdvanceState {
  enabled: boolean;
  ttsSupported: boolean;
  /** 直前 tick の TTS 再生状態（true → false の遷移で完了とみなす） */
  prevPlaying: boolean;
  /** 現 tick の TTS 再生状態 */
  currentPlaying: boolean;
  /** TTS 一時停止中なら完了扱いしない */
  paused: boolean;
}

/**
 * オートモード中、TTS が完了したと見なせるかを判定する。
 *
 * - enabled が false / TTS 非対応 / 一時停止中ならスキップ
 * - prevPlaying=true → currentPlaying=false の遷移で「完了」とみなす
 */
export function isAutoReadFinished(state: AutoReadAdvanceState): boolean {
  if (!state.enabled || !state.ttsSupported || state.paused) return false;
  return state.prevPlaying && !state.currentPlaying;
}

export interface AutoReadFetchTriggerState {
  enabled: boolean;
  /** 全文取得が必要かどうか（既に十分な本文があるなら false） */
  canFetch: boolean;
  /** 現在フェッチ中なら false（重複起動防止） */
  fetching: boolean;
  /** 取得済み or 元々十分な本文があれば true */
  hasContent: boolean;
}

/**
 * オートモード中、全文取得をトリガーすべきかを判定する。
 */
export function shouldTriggerAutoFetch(state: AutoReadFetchTriggerState): boolean {
  if (!state.enabled || state.fetching) return false;
  // canFetch=false なら fetch 不要、hasContent=true なら既に読める
  if (!state.canFetch) return false;
  return !state.hasContent;
}

export interface AutoReadSpeakTriggerState {
  enabled: boolean;
  ttsSupported: boolean;
  /** 既に再生中・一時停止中ならスキップ */
  ttsPlaying: boolean;
  ttsPaused: boolean;
  /** 全文取得中ならまだ speak しない */
  fetching: boolean;
  /** 読み上げ対象テキストの有無 */
  hasText: boolean;
  /**
   * 全文取得トリガー対象の記事か (`useArticleViewContent.canFetch`)。
   * `true` の場合は `hasFullContent` が揃うまで TTS を待つ (#663)。
   */
  canFetch?: boolean;
  /**
   * 全文コンテンツ (`processedContent`) が取得済みか。
   * サマリは含めない厳格判定 (#663)。
   */
  hasFullContent?: boolean;
  /**
   * autoTranslate ON で翻訳が未完了か (#653)。
   * `true` の場合は翻訳完了 (translateResult or translateError) を待ってから speak する。
   * `false` / 未指定なら従来通り即 speak。
   */
  autoTranslatePending?: boolean;
  /**
   * autoMode + autoSummarize ON で要約が未完了か (#696)。
   * `true` の場合は要約完了 (aiResult or aiError) を待ってから speak する。
   * 要約結果を `ttsText` として読み上げたいが、要約完了前に speak が走ると
   * 全文を読み上げてしまうため、明示的に gate する。
   */
  autoSummarizePending?: boolean;
}

/**
 * オートモード中、TTS speak を開始すべきかを判定する。
 *
 * #663: `canFetch=true` の記事は **全文取得が完了するまで** speak しない。
 * 従来は `hasText` だけで判定していたため、`buildTtsText` がサマリを
 * fallback で返すと「概要のみ読み上げ」が発生していた。
 *
 * `canFetch=false` の記事 (埋め込みコンテンツ・既に長い本文を持つ記事) は
 * 元々 fetch 対象外なので、サマリ fallback でも speak を開始してよい。
 *
 * #653: `autoTranslatePending=true` の場合は翻訳完了を待つ。これがないと
 * 翻訳完了前に原文で speak が始まり、「翻訳側を読み上げない」状態になる。
 */
export function shouldStartAutoSpeak(state: AutoReadSpeakTriggerState): boolean {
  if (!state.enabled || !state.ttsSupported) return false;
  if (state.ttsPlaying || state.ttsPaused) return false;
  if (state.fetching) return false;
  if (!state.hasText) return false;
  // canFetch 対象記事はフル本文が揃うまで待つ（サマリ fallback による誤発火防止）
  if (state.canFetch && !state.hasFullContent) return false;
  // autoTranslate 完了待ち（翻訳結果で speak したい）
  if (state.autoTranslatePending) return false;
  // autoMode + autoSummarize 完了待ち (#696: 要約結果を speak したい)
  if (state.autoSummarizePending) return false;
  return true;
}
