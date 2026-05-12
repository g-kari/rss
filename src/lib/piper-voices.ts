/**
 * piper-plus engine で利用可能な voice の定義 (#761)。
 *
 * piper-plus は `model:` option に以下のいずれかを受け取る:
 *   - shortcut (例: `"tsukuyomi"` — HF `ayousanz/piper-plus-tsukuyomi-chan` を解決)
 *   - HuggingFace repo 名 (例: `"ayousanz/piper-plus-tsukuyomi-chan"`)
 *   - 直接 URL (例: `"/api/piper-voice/tsukuyomi.onnx"` — config は `<model-url>.json`)
 *
 * 本プロジェクトでは R2 セルフホストで配信するため **直接 URL** を採用。
 * 配置先は `app/api/piper-voice/[file]/route.ts` (R2 prefix: `piper-voices/`)。
 *
 * voice 追加手順:
 *   1. このファイルの `PIPER_PLUS_VOICES` に entry 追加 (id / model URL / lang / name)
 *   2. `scripts/upload-piper-voices.mjs` に対応する HuggingFace 配布元と R2 配置先を追記
 *   3. `npm run upload:piper-voices` で R2 にアップロード
 */

import type { TtsVoice } from "./tts-adapter";

/** piper-plus engine の voice 定義 */
export interface PiperPlusVoice {
  /** voiceURI prefix (例: `"tsukuyomi"`) — `piper:` prefix と組み合わせて識別子に */
  readonly id: string;
  /** piper-plus `model` option に渡す URL (R2 経由 Route Handler) */
  readonly model: string;
  /** BCP 47 言語コード (UI 表示・auto-detect 補助) */
  readonly lang: string;
  /** synthesize() の language option (`"ja"` / `"en"` 等) */
  readonly synthesisLanguage: string;
  /** UI 表示名 */
  readonly name: string;
}

export const PIPER_PLUS_VOICES: readonly PiperPlusVoice[] = [
  {
    id: "tsukuyomi",
    model: "/api/piper-voice/tsukuyomi.onnx",
    lang: "ja-JP",
    synthesisLanguage: "ja",
    name: "つくよみちゃん (Piper)",
  },
];

/** voiceURI から PiperPlusVoice を引く (piper:<id> 形式) */
export function findPiperPlusVoice(voiceUri: string | null): PiperPlusVoice | null {
  if (!voiceUri || !voiceUri.startsWith("piper:")) return null;
  const id = voiceUri.slice("piper:".length);
  return PIPER_PLUS_VOICES.find((v) => v.id === id) ?? null;
}

/** piper-plus voice を抽象 TtsVoice に変換 */
export function piperPlusVoiceToTtsVoice(voice: PiperPlusVoice): TtsVoice {
  return {
    voiceURI: `piper:${voice.id}`,
    name: voice.name,
    lang: voice.lang,
    default: false,
  };
}
