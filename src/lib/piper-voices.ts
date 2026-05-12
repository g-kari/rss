/**
 * piper-plus engine で利用可能な voice の定義 (#761)。
 *
 * # voice 追加手順
 *
 * ## 基本パターン: HuggingFace 直接配信 (推奨 / 最小修正)
 *
 * 本プロジェクトの **default 配信方式**。voice モデル本体は HF + Cloudflare 系 CDN cache 経由で
 * 十分高速。CSP `connect-src https://huggingface.co` は #760 で既に許可済。
 *
 * 1. 下記 `PIPER_PLUS_VOICES` 配列に entry 追加するだけ。例:
 *    ```ts
 *    {
 *      id: "css10-ja",
 *      model: "ayousanz/piper-plus-css10-ja-6lang", // HuggingFace repo 名
 *      lang: "ja-JP",
 *      synthesisLanguage: "ja",
 *      name: "CSS10 Japanese (Piper)",
 *      // credit は voice に license 義務がある場合のみ (後述)
 *    }
 *    ```
 * 2. commit + push → Cloudflare CI/CD 自動 deploy → 設定モーダルに自動反映
 * 3. UI 側は `useTtsAdapter().voices` 経由で `voiceURI = "piper:<id>"` として選択可能になる
 *
 * ### piper-plus が標準提供しているモデル (公式 README より)
 *
 * | モデル              | HuggingFace repo                       | 言語                       |
 * | ------------------- | -------------------------------------- | -------------------------- |
 * | Tsukuyomi-chan      | `ayousanz/piper-plus-tsukuyomi-chan`   | 日本語 (6 言語対応)        |
 * | CSS10 Japanese      | `ayousanz/piper-plus-css10-ja-6lang`   | 日本語 (6 言語対応)        |
 * | Base (571 speakers) | `ayousanz/piper-plus-base`             | 6 言語 multi-speaker base  |
 *
 * shortcut 名 (`"tsukuyomi"` 等) でも piper-plus 側で resolve されるが、
 * **HuggingFace repo 名を明示する方が将来 library 仕様変更時のトラブルが少ない** ため推奨。
 *
 * ## 拡張パターン: R2 セルフホスト (CDN 制御 / 自前学習モデル使用時)
 *
 * 外部 ONNX モデルや自前学習モデル、もしくは HF dependency を削減したい場合の手順。
 *
 * 1. `scripts/upload-piper-voices.mjs` の `VOICES` array に entry 追加
 *    (HuggingFace から DL + R2 へ rename upload する script)
 * 2. `app/api/piper-voice/[file]/route.ts` の `ALLOWED_FILES` に
 *    `<id>.onnx` + `<id>.onnx.json` の 2 ファイル追加
 * 3. 下記 `PIPER_PLUS_VOICES` の `model` を `"/api/piper-voice/<id>.onnx"` に設定
 *    + `src/hooks/usePiperTts.ts` の `lib.initialize({ model })` 渡し方を相対 → 絶対 URL
 *    (`new URL(voice.model, window.location.origin).toString()`) 変換に変更が必要
 * 4. `npm run upload:piper-voices` で R2 へ事前 upload
 * 5. commit + push → Cloudflare CI/CD 自動 deploy
 *
 * **WASM (60 MiB) は引き続き R2 セルフホスト必須** (Cloudflare Workers 単一 asset 25 MiB 上限のため)。
 *
 * ## ライセンス義務がある voice の場合 (重要)
 *
 * CC BY 等のライセンスやコーパス規約で **クレジット表記 / ユーザー二次利用制限の告知が必須**
 * な voice は `credit` field を必ず設定すること。設定すれば既存 UI
 * (`src/components/user-settings/TtsVoiceSection.tsx`) が自動で:
 *
 * - 設定モーダルに専用クレジット欄を表示 (border 付き、十分な文字サイズ)
 * - 公式 URL link + ライセンス名 + 禁止用途リスト (`restrictions[]`) を表示
 *
 * を行う。`PiperPlusVoiceCredit` interface の 4 フィールドを埋めるだけで OK。
 *
 * 例 (つくよみちゃんコーパスの場合):
 * ```ts
 * credit: {
 *   creditText: "音声合成には...「つくよみちゃん」の音声データを使用しています。\nつくよみちゃんコーパス（CV.夢前黎）",
 *   creditUrl: "https://tyc.rei-yumesaki.net/material/corpus/",
 *   license: "CC BY 4.0 + つくよみちゃんコーパス利用規約",
 *   restrictions: ["出力音声を批判・攻撃に使用すること", ...],
 * }
 * ```
 *
 * ## チェックリスト (voice 追加 PR 出す前)
 *
 * - [ ] HuggingFace repo の **ライセンス確認** + 必要なら `credit` field 設定
 * - [ ] `synthesisLanguage` が piper-plus 対応言語 (`"ja"` / `"en"` / `"zh"` / `"ko"` / `"es"` / `"fr"` / `"pt"` / `"sv"`) と一致
 * - [ ] `lang` が BCP 47 形式 (`ja-JP` / `en-US` 等)
 * - [ ] `id` が `^[a-z0-9-]+$` (voiceURI prefix として使うため)
 * - [ ] R2 セルフホスト時は `ALLOWED_FILES` + R2 upload も忘れない
 * - [ ] README.md の音声素材ライセンス節も更新 (license 義務 voice の場合)
 * - [ ] `RELEASE_NOTES.md` に新 voice 追加を告知
 */

import type { TtsVoice } from "./tts-adapter";

/**
 * voice のライセンス・クレジット情報。
 *
 * 該当 voice を UI で公開する場合、`creditText` を **「目立つ場所に十分な文字サイズで」** 表示し、
 * `restrictions` をユーザーに告知する義務がある (各コーパスの利用規約に基づく)。
 *
 * UI 配線は `src/components/user-settings/TtsVoiceSection.tsx` で自動。
 * Piper engine 選択中で voice が credit field を持っているとき、専用クレジット欄が描画される。
 */
export interface PiperPlusVoiceCredit {
  /**
   * 表示必須のクレジット文。コーパス規定の **典型文をそのまま厳格に使う** こと。
   * 改行が必要なら `\n` で。`whitespace-pre-line` で render される。
   *
   * 例: `"音声合成には、フリー素材キャラクター「つくよみちゃん」の音声データを使用しています。\nつくよみちゃんコーパス（CV.夢前黎）"`
   */
  readonly creditText: string;
  /**
   * クレジットに含めるべき公式 URL (UI で external link として表示)。
   *
   * 例: `"https://tyc.rei-yumesaki.net/material/corpus/"`
   */
  readonly creditUrl: string;
  /**
   * ユーザーへの利用制限告知文 (出力音声の禁止用途等)。
   * UI で `<ul>` の箇条書きとして描画される。
   *
   * 例: `["出力音声を批判・攻撃に使用すること", "政治的主張への賛同呼びかけに使用すること", ...]`
   */
  readonly restrictions: readonly string[];
  /**
   * ライセンス名 (UI で「ライセンス: XXX」として表示)。
   *
   * 例: `"CC BY 4.0"` / `"CC BY 4.0 + つくよみちゃんコーパス利用規約"`
   */
  readonly license: string;
}

/**
 * piper-plus engine の voice 定義。
 *
 * `PIPER_PLUS_VOICES` に追加すると `useTtsAdapter().voices` に自動公開されて UI で選択可能に。
 * 詳細な追加手順はファイル冒頭の JSDoc を参照。
 */
export interface PiperPlusVoice {
  /**
   * voice 識別子 (英小文字 + 数字 + ハイフンのみ推奨)。
   *
   * 内部で `voiceURI = "piper:<id>"` 形式で他 engine (Web Speech) と区別される。
   * 例: `"tsukuyomi"` → `voiceURI = "piper:tsukuyomi"`
   */
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
  /**
   * BCP 47 言語コード (UI の言語別グループ化 + auto-detect 補助に使用)。
   *
   * 例: `"ja-JP"` / `"en-US"` / `"zh-CN"` / `"ko-KR"`
   */
  readonly lang: string;
  /**
   * piper-plus `synthesize()` の `language` option に渡す値。
   *
   * piper-plus 対応言語: `"ja"` / `"en"` / `"zh"` / `"ko"` / `"es"` / `"fr"` / `"pt"` / `"sv"`
   * (本リスト外の値を渡すと synthesize エラーになるため必ず対応言語と一致させる)。
   */
  readonly synthesisLanguage: string;
  /**
   * UI 表示名 (設定モーダルの voice 選択 UI に表示)。
   *
   * 例: `"つくよみちゃん (Piper)"` / `"CSS10 Japanese (Piper)"`
   */
  readonly name: string;
  /**
   * ライセンス・クレジット情報 (UI で表示義務がある voice のみ設定)。
   *
   * CC BY やコーパス規約等で **クレジット表記 / ユーザー二次利用制限の告知が必須** な voice は
   * 必ず設定すること。UI が自動でクレジット欄を表示する。
   */
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
  {
    id: "mera",
    // Kizuna Intelligence の看板キャラクター「メラちゃん」voice (合成音声、声優由来なし)
    model: "kizuna-intelligence/piper-plus-mera-multilingual",
    lang: "ja-JP",
    synthesisLanguage: "ja",
    name: "メラちゃん (Kizuna Intelligence)",
    // Apache-2.0 ライセンス: クレジット表記は MUST ではなく推奨。ただし piper-plus base
    // (ayousanz) + Piper 元実装 (rhasspy/piper) への謝意を含める設計。
    // 利用制限は Apache 2.0 標準 (著作権表示保持 / NOTICE 伝達 / 改変箇所明示)、
    // 厳格な「禁止用途」リストはコーパス規約のような制約は無いため空配列。
    credit: {
      creditText:
        "メラちゃん voice は Kizuna Intelligence が公開する合成音声モデルです。\n" +
        "piper-plus base (ayousanz) + Piper 元実装 (rhasspy/piper) を基盤としています。",
      creditUrl: "https://huggingface.co/kizuna-intelligence/piper-plus-mera-multilingual",
      license: "Apache License 2.0",
      restrictions: [],
    },
  },
];

/**
 * voiceURI (`"piper:<id>"` 形式) から `PiperPlusVoice` を引く。
 *
 * - Web Speech voice (voiceURI が URL 形式) は null を返す
 * - `piper:` prefix だが id が未知の場合も null を返す
 */
export function findPiperPlusVoice(voiceUri: string | null): PiperPlusVoice | null {
  if (!voiceUri || !voiceUri.startsWith("piper:")) return null;
  const id = voiceUri.slice("piper:".length);
  return PIPER_PLUS_VOICES.find((v) => v.id === id) ?? null;
}

/**
 * piper-plus voice を抽象 `TtsVoice` に変換 (UI / hook 横断の共通型へのマッピング)。
 *
 * `default: false` 固定 (Piper engine は概念としてデフォルト voice を持たない、
 * ユーザーが明示的に選択する設計)。
 */
export function piperPlusVoiceToTtsVoice(voice: PiperPlusVoice): TtsVoice {
  return {
    voiceURI: `piper:${voice.id}`,
    name: voice.name,
    lang: voice.lang,
    default: false,
  };
}
