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
   */
  errorCount: number;
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
