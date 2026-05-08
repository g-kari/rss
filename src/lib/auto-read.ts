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
}

/**
 * オートモード中、TTS speak を開始すべきかを判定する。
 */
export function shouldStartAutoSpeak(state: AutoReadSpeakTriggerState): boolean {
  if (!state.enabled || !state.ttsSupported) return false;
  if (state.ttsPlaying || state.ttsPaused) return false;
  if (state.fetching) return false;
  return state.hasText;
}
