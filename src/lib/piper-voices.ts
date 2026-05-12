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

/**
 * voice のライセンス・クレジット情報。
 *
 * 該当 voice を UI で公開する場合、`creditText` を **「目立つ場所に十分な文字サイズで」** 表示し、
 * `restrictions` をユーザーに告知する義務がある (各コーパスの利用規約に基づく)。
 */
export interface PiperPlusVoiceCredit {
  /** 表示必須のクレジット文 (コーパス規定の典型文を厳格に使う) */
  readonly creditText: string;
  /** クレジットに含めるべき公式 URL */
  readonly creditUrl: string;
  /** ユーザーへの利用制限告知文 (出力音声の禁止用途等) */
  readonly restrictions: readonly string[];
  /** ライセンス名 (例: `"CC BY 4.0"`) */
  readonly license: string;
}

/** piper-plus engine の voice 定義 */
export interface PiperPlusVoice {
  /** voiceURI prefix (例: `"tsukuyomi"`) — `piper:` prefix と組み合わせて識別子に */
  readonly id: string;
  /**
   * piper-plus `model` option に渡す値。
   *
   * 以下の 3 形式が library で受け付けられる:
   * - HuggingFace repo 名 (例: `"ayousanz/piper-plus-tsukuyomi-chan"`) — **本プロジェクトはこれを採用**
   * - 標準 voice の shortcut (例: `"tsukuyomi"`)
   * - 絶対 URL (例: `"https://example.com/model.onnx"` — config は同 path `.json` 必須)
   *
   * 採用理由: HuggingFace は piper-plus の standard path で library 互換性が確実。
   * CSP `connect-src` に `huggingface.co` は #760 で許可済。voice モデルは HF + CDN cache
   * 経由で十分高速 (R2 セルフホストするほどの規模感ではない)。
   */
  readonly model: string;
  /** BCP 47 言語コード (UI 表示・auto-detect 補助) */
  readonly lang: string;
  /** synthesize() の language option (`"ja"` / `"en"` 等) */
  readonly synthesisLanguage: string;
  /** UI 表示名 */
  readonly name: string;
  /** ライセンス・クレジット情報 (UI で表示義務がある voice のみ設定) */
  readonly credit?: PiperPlusVoiceCredit;
}

export const PIPER_PLUS_VOICES: readonly PiperPlusVoice[] = [
  {
    id: "tsukuyomi",
    // ayousanz の HuggingFace repo を直接参照 (piper-plus が内部で resolve)
    model: "ayousanz/piper-plus-tsukuyomi-chan",
    lang: "ja-JP",
    synthesisLanguage: "ja",
    name: "つくよみちゃん (Piper)",
    // つくよみちゃんコーパス利用規約 (https://tyc.rei-yumesaki.net/material/corpus/)
    // ③ソフト配布の場合、公式規定文を「目立つ場所に十分な文字サイズで」掲載する義務あり。
    // 派生物の二次利用制限 (出力音声の禁止用途) も UI でユーザーに告知が必要。
    credit: {
      creditText:
        "音声合成には、フリー素材キャラクター「つくよみちゃん」の音声データを使用しています。\n" +
        "つくよみちゃんコーパス（CV.夢前黎）",
      creditUrl: "https://tyc.rei-yumesaki.net/material/corpus/",
      license: "CC BY 4.0 + つくよみちゃんコーパス利用規約",
      restrictions: [
        "出力音声を批判・攻撃に使用すること",
        "政治的主張への賛同呼びかけに使用すること",
        "成人向け作品でゾーニングなしに公開すること",
        "他者の二次素材として再配布すること",
      ],
    },
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
