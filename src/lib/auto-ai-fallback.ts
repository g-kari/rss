/**
 * 自動翻訳・自動要約のブラウザネイティブ AI フォールバック判定 (#700)。
 *
 * オートモード ON 時に、ブラウザネイティブ AI (Chrome Translator / Summarizer)
 * が利用不可なら Workers AI へフォールバックする挙動を、ユーザー設定 `autoAiBrowserOnly`
 * (default false) でブロックできるようにする。
 *
 * - default: 既存挙動維持 (フォールバックあり)
 * - `autoAiBrowserOnly = true` 設定時: ブラウザ AI 不可なら自動 trigger を skip し、
 *   Workers AI へのフォールバックを発動させない。手動 trigger (記事ヘッダー AI/翻訳ボタン)
 *   は影響を受けない (ユーザーの明示的な選択を尊重するため)。
 */

/**
 * 自動翻訳・自動要約の effect で「ブラウザ AI 不可なら skip するか」を判定する。
 *
 * @param browserAiAvailable - ブラウザ AI が利用可能か。`null` は診断中 (未確定)。
 * @param browserOnlyEnabled - ユーザー設定 `autoAiBrowserOnly` の値。
 * @returns `true` なら auto trigger を skip すべき。
 *
 * 挙動表:
 * | browserOnlyEnabled | browserAiAvailable | 戻り値 | 意図 |
 * | --- | --- | --- | --- |
 * | false | (任意) | false | 設定 OFF → 既存挙動 (常に trigger) |
 * | true | true | false | ブラウザ AI 利用可能 → trigger OK |
 * | true | false | true | ブラウザ AI 不可 + 設定 ON → skip |
 * | true | null | true | 診断中 → 安全側に skip (確定後に再評価) |
 */
export function shouldSkipAutoAi(
  browserAiAvailable: boolean | null,
  browserOnlyEnabled: boolean,
): boolean {
  if (!browserOnlyEnabled) return false;
  if (browserAiAvailable === null) return true;
  return !browserAiAvailable;
}
