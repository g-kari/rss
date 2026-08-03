/**
 * TTS (Text-to-Speech) エンジンの抽象化レイヤー (#675 Phase 1a)。
 *
 * 既存の Web Speech API (`useSpeechSynthesis`) と将来の wasm 実装 (Piper / つくよみちゃん #674)
 * を共通インターフェース `TtsAdapter` 経由で扱えるようにし、UI 層や上位 hook が engine 種別を
 * 知らなくてよい設計にする。
 *
 * Phase 1a (本ファイル): 型定義 + voice 構造的互換性ヘルパーのみ。実装の差し替えは Phase 1b 以降。
 */

/**
 * 抽象化された TTS voice (engine 共通最小プロパティ)。
 *
 * `SpeechSynthesisVoice` (Web Speech API 標準) は `voiceURI` / `name` / `lang` / `default` を
 * 構造的に持つため、そのまま `TtsVoice` として扱える。
 * Piper wasm voice は `{ voiceURI: model URL, name: モデル名, lang: "ja", default: false }`
 * のように mapping すれば同様に扱える。
 */
export interface TtsVoice {
  /** voice の一意識別子 (Web Speech: voiceURI / Piper: model URL 等) */
  voiceURI: string;
  /** UI 表示名 */
  name: string;
  /** BCP 47 言語タグ (例: "ja-JP", "en-US") */
  lang: string;
  /** engine のデフォルト voice か */
  default?: boolean;
}

/** TTS 読み上げ速度 (engine 共通)。実装側で許容範囲を制限する。 */
export type TtsRate = number;

/** TTS engine 種別 (UI 表示・設定保存に使う識別子)。 */
export type TtsEngineId = "web-speech" | "piper";

/**
 * 抽象化された TTS エラーコード (#756)。
 *
 * Web Speech API の `SpeechSynthesisErrorCode` と Piper wasm engine の内部エラーを統合し、
 * consumer (UI 層) が engine 種別を意識せずに「どんな失敗だったか」を判定できるようにする。
 *
 * 値別の推奨処理:
 * - `canceled` / `interrupted` / `audio-busy` → silent skip (engine 側で `errorCount` を increment しない)
 * - `voice-unavailable` → 自動で `setVoiceUri(null)` reset + toast
 * - `language-unavailable` / `not-allowed` / `synthesis-failed` / `audio-hardware` / `network` / `model-error` / `unknown` → toast (文言は consumer 側で切替)
 */
export type TtsErrorCode =
  | "canceled"
  | "interrupted"
  | "audio-busy"
  | "not-allowed"
  | "language-unavailable"
  | "voice-unavailable"
  | "synthesis-failed"
  | "audio-hardware"
  | "network"
  | "model-error"
  | "unknown";

/**
 * `errorCount` を increment せず devError ログのみで処理する「silent skip」対象。
 * バックグラウンド遷移や明示的 cancel など、ユーザーへ通知すべきでないエラー種別。
 */
export const TTS_SILENT_SKIP_ERRORS: ReadonlySet<TtsErrorCode> = new Set<TtsErrorCode>([
  "canceled",
  "interrupted",
  "audio-busy",
]);

/**
 * Web Speech API の `SpeechSynthesisErrorEvent.error` 値を抽象 `TtsErrorCode` に正規化する。
 * 未知の値は `"unknown"` にフォールバック。
 */
export function normalizeWebSpeechError(rawError: string): TtsErrorCode {
  switch (rawError) {
    case "canceled":
    case "interrupted":
    case "audio-busy":
    case "not-allowed":
    case "language-unavailable":
    case "voice-unavailable":
    case "synthesis-failed":
    case "audio-hardware":
    case "network":
      return rawError;
    default:
      return "unknown";
  }
}

/**
 * `TtsErrorCode` 別のユーザー向け toast 文言を返す。`null` 戻り値は「toast 不要」を意味する
 * (silent skip 対象 + canceled)。
 */
export function formatTtsErrorMessage(code: TtsErrorCode | null): string | null {
  if (code === null) return null;
  if (TTS_SILENT_SKIP_ERRORS.has(code)) return null;
  switch (code) {
    case "language-unavailable":
      return "端末でこの言語の voice が利用できません。設定 → Voice で別の voice を選んでください";
    case "voice-unavailable":
      return "選択中の voice が利用できなくなりました。自動選択に戻します";
    case "not-allowed":
      return "ブラウザの音声再生許可が必要です。画面をタップしてからお試しください";
    case "synthesis-failed":
      return "読み上げエンジンで内部エラーが発生しました";
    case "audio-hardware":
      return "音声出力デバイスでエラーが発生しました";
    case "network":
      return "ネットワークエラーで読み上げに失敗しました";
    case "model-error":
      return "Piper モデル読み込みに失敗しました";
    case "unknown":
      return "読み上げに失敗しました (詳細不明)";
    default:
      return null;
  }
}

/**
 * 読み上げエンジンの抽象インターフェース。`useSpeechSynthesis` (Web Speech) や
 * 将来の `usePiperTts` が共に実装する。
 */
export interface TtsAdapter {
  /** engine 種別 — 設定 UI で表示 / debug / 保存キー判定に使う */
  readonly engine: TtsEngineId;
  /** 当該実行環境で利用可能か (engine 不対応・wasm 未ロード等で false) */
  supported: boolean;
  /** 現在再生中か */
  isPlaying: boolean;
  /** 一時停止中か */
  isPaused: boolean;
  /**
   * TTS が「自然完了」(`utterance.onend` 相当) した累積回数 (#716)。
   *
   * 手動 `stop()` (= `speechSynthesis.cancel()`) では increment しない。
   * オートモード (`AutoReadController`) は本値の増加を「自然完了」のシグナルとして使い、
   * 手動停止と確実に区別して次記事への自動遷移を判定する。
   *
   * 値の絶対値に意味はない (overflow 設計不要)。`prev → current` の差分でのみ判定する。
   */
  endedCount: number;
  /**
   * TTS が `utterance.onerror` (engine 由来エラー) で停止した累積回数 (#743)。
   * consumer はこのカウンタの増加を検知してユーザーにエラー通知 (toast 等) を出す。
   * silent fail を避けるための表面化チャネル。
   *
   * `TTS_SILENT_SKIP_ERRORS` (canceled / interrupted / audio-busy) では increment しない (#756)。
   */
  errorCount: number;
  /**
   * 直近の TTS エラー種別 (#756)。`errorCount` 増加時に consumer が文言切替に使う。
   * silent skip された error も lastError には記録される (debug 用)。`null` = エラーなし状態。
   */
  lastError: TtsErrorCode | null;
  /**
   * 直近の TTS エラーの詳細情報 (DevTools がないスマホでも原因切り分けできるようにする)。
   *
   * `errorCount` 増加と同時に set される (silent skip 対象は detail も null のまま)。
   * 専用 floating toast (`PiperErrorDetailToast`) が監視して voice / model / message を
   * 表示 + クリップボードコピーボタンを提供。
   *
   * `null` = エラーなし or silent skip。
   */
  lastErrorDetail?: {
    /** エラー種別 (lastError と同じ値、コピー時の文脈に含める) */
    code: TtsErrorCode;
    /** Error.message or 等価のメッセージ */
    message: string;
    /** Error.name (例: "NotAllowedError" / "NetworkError") */
    name?: string;
    /** 該当 voice の identifier (例: "piper:tsukuyomi" / Web Speech voiceURI) */
    voiceUri?: string | null;
    /** 該当 model の identifier (例: "ayousanz/piper-plus-tsukuyomi-chan"、Piper のみ) */
    model?: string;
    /** engine 種別 (コピー時の文脈に含める) */
    engine: TtsEngineId;
    /** 発生時刻 (ISO 8601、コピー時の文脈に含める) */
    occurredAt: string;
  } | null;
  /** 現在の速度 */
  rate: TtsRate;
  /** 速度を順番に切り替え (engine 別の許容セットで cycle)。戻り値は次の rate 値 (UX 監査 #2: Shift+R toast 表示用) */
  cycleRate: () => number;
  /** 現在の音量 (0.0〜1.0、Web Speech API 仕様準拠) */
  volume: number;
  /** 音量を変更 (再生中なら新音量で再生し直す)。範囲外は内部で clamp */
  setVolume: (v: number) => void;
  /** 利用可能な voice 一覧 (非同期に変化することあり: voiceschanged / wasm モデル DL 完了等) */
  voices: TtsVoice[];
  /** 現在ユーザーが選択している voiceURI (null = 自動選択 = 言語マッチ→default→先頭) */
  voiceUri: string | null;
  /** voice を変更 (再生中なら voice を切替えて再生し直す) */
  setVoiceUri: (uri: string | null) => void;
  /** テキストを読み上げ開始。onBoundary は engine が提供する場合のみ呼ばれる (#659) */
  speak: (text: string, onBoundary?: (charIndex: number) => void) => void;
  /** 一時停止 */
  pause: () => void;
  /** 再開 */
  resume: () => void;
  /** 停止・リセット */
  stop: () => void;
  /**
   * engine を切り替える (UserSettingsModal で expose 用、optional)。
   * App.tsx で composition 経由で注入される。`useSpeechSynthesis` / `usePiperTts` 単体では undefined。
   * #674 Phase 2b で導入。
   */
  setEngine?: (engine: TtsEngineId) => void;
  /**
   * 当該実行環境で利用可能な engine 一覧 (UI の engine 切替メニューで列挙する)。
   * App.tsx で composition 経由で注入される。
   */
  availableEngines?: readonly TtsEngineId[];
  /**
   * engine 初期化中の進捗情報 (#761)。
   *
   * - `null` = 初期化していない / 完了済
   * - object = 進行中 (UI 側で floating progress toast 等に表示)
   *
   * Web Speech engine では常に `null` (初期化即時完了のため進捗なし)。Piper engine では
   * library / WASM / model DL の各段階で更新される。`progress` は 0.0〜1.0。
   */
  initProgress?: {
    stage: string;
    progress: number;
    message: string;
  } | null;
}

/**
 * Piper wasm engine 未 mount 時 (engine === "web-speech" default) に AppShell へ渡す
 * no-op TtsAdapter。`piper-plus` wasm chunk (Emscripten runtime 数 MB) を初期 load から
 * 除外するため PiperEngineHost を条件 mount 化した結果、非 mount 時に本 dummy adapter を
 * 使う。engine 切替で "piper" に遷移した瞬間に PiperEngineHost が mount して実 adapter に
 * 差し替わる。engine 切替時の stop() 呼出 (AppShell.tsx useSyncedRef 経由) は本 no-op で
 * 無害。設計意図は "Web Speech default user は piper chunk を触らない" 一点に絞る。
 */
export function createDummyPiperAdapter(): TtsAdapter {
  return {
    engine: "piper",
    supported: false,
    isPlaying: false,
    isPaused: false,
    endedCount: 0,
    errorCount: 0,
    lastError: null,
    rate: 1,
    cycleRate: () => 1,
    volume: 1,
    setVolume: () => {},
    voices: [],
    voiceUri: null,
    setVoiceUri: () => {},
    speak: () => {},
    pause: () => {},
    resume: () => {},
    stop: () => {},
  };
}

/**
 * `SpeechSynthesisVoice` (Web Speech API) を抽象 `TtsVoice` 型として扱うための変換ヘルパー。
 *
 * SpeechSynthesisVoice は仕様上 voiceURI / name / lang / default を持つため、
 * 構造的に TtsVoice と互換だが、明示的な変換関数を提供することで:
 *   1. mapping ロジックを 1 箇所に集約 (将来の field 拡張で安全)
 *   2. localVoice 等の Web Speech 固有 field を捨てる責務を明確化
 *   3. wasm engine 用の同等関数 (`piperVoiceToTtsVoice` 等) と並列実装できる
 *
 * 実行時オーバーヘッドは 1 配列 map のみ (voice 数は通常 100 件未満)。
 */
export function speechSynthesisVoiceToTtsVoice(v: {
  voiceURI: string;
  name: string;
  lang: string;
  default?: boolean;
}): TtsVoice {
  return {
    voiceURI: v.voiceURI,
    name: v.name,
    lang: v.lang,
    default: v.default,
  };
}
