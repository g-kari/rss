/**
 * piper-plus library の module 型宣言 (#820)。
 *
 * usePiperTts.ts で `as unknown as { PiperPlus: PiperPlusLib }` double cast を回避するために
 * library 側の type 公開状況に依らず、本プロジェクトが期待する shape を declare module 経由で
 * 補完する。library 側で型定義が改善された / 公開 shape が変わったときは typecheck が落ちて
 * breaking change を検出可能になる (silent drift を防ぐ目的)。
 *
 * 関連:
 *   - helper-drift.md「新規 dev dependency 追加前に既存 devDeps の流用可能性を grep」: 本宣言は
 *     usePiperTts 専用のため lib に切り出さず、d.ts として `src/` 配下に置く (consumer は単一)。
 *   - react-component-split.md「Phase 0: 型抽象化のみ」: 本宣言は実装挙動を変えない型のみの
 *     drift 解消で、`tts-adapter.ts` の `TtsAdapter` 抽象とは独立 (engine 固有 raw shape の declare)。
 */

declare module "piper-plus" {
  /**
   * piper-plus の `synthesize` / `synthesizeWithVoiceCloning` が返す合成結果。
   * 低レベル data (samples / sampleRate) で自前 AudioBufferSourceNode 再生する設計のため
   * (#766) play() は使わず、samples を直接 AudioContext.createBuffer に流す。
   */
  export interface PiperPlusAudioResult {
    play: () => Promise<void>;
    duration: number;
    sampleRate: number;
    samples: Float32Array;
  }

  /**
   * 初期化後の TTS engine インスタンス。voice 切替時は dispose() で resource 解放 → 新規 initialize。
   */
  export interface PiperPlusInstance {
    synthesize: (
      text: string,
      options?: { language?: string; lengthScale?: number },
    ) => Promise<PiperPlusAudioResult>;
    /**
     * Multi-speaker / voice-cloning model 向け合成 API。speaker embedding (Float32Array) を
     * 渡して ONNX model の `speaker_embedding` input tensor を埋める。
     * zero-filled embedding を渡すと default speaker 0 の voice が合成される。
     */
    synthesizeWithVoiceCloning: (
      text: string,
      speakerEmbedding: Float32Array,
      options?: { language?: string; lengthScale?: number },
    ) => Promise<PiperPlusAudioResult>;
    dispose: () => void;
  }

  /**
   * piper-plus が module の named export `PiperPlus` として公開している library 本体。
   * 実体は `initialize(options)` を持つ object (class 風ファクトリ)。
   */
  export const PiperPlus: {
    initialize: (options: {
      model: string;
      ort: unknown;
      wasmG2pUrl?: string;
      zhDictBaseUrl?: string;
      onProgress?: (info: { stage: string; progress: number; message: string }) => void;
    }) => Promise<PiperPlusInstance>;
  };
}
