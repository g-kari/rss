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
  /** 現在の速度 */
  rate: TtsRate;
  /** 速度を順番に切り替え (engine 別の許容セットで cycle) */
  cycleRate: () => void;
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
