/**
 * #811 ArticleAiPanel の `renderSummary` を純粋関数として切り出した版。
 *
 * 背景:
 * 本番 minified エラー `TypeError: e.startsWith is not a function` が ArticleView
 * ErrorBoundary 配下で発生。原因は AI summary 表示用の `line.startsWith("## ")` で
 * line が string でない経路 (decodeCached 旧形式 / API response edge case /
 * localStorage の予期せぬ値) が出ること。型 narrowing は通っていたが runtime で
 * 想定外の non-string 値が混入。
 *
 * 対策:
 * - text 入力が非 string なら空配列 fallback (defensive)
 * - 各 line も string 強制 (Array(...).flat() 等で混入しても safe)
 * - JSX 描画ロジックと parse 判定を分離して TDD spec で edge case を網羅
 */

/**
 * AI summary text の 1 行を分類した結果。
 *
 * - `heading`: `## ` で始まる見出し行 (text は `## ` を除いた残り)
 * - `bullet`: `・` / `-` / `•` + 空白で始まる箇条書き行 (text は marker を除いた残り)
 * - `empty`: 空白のみ / 空文字 (描画 skip 対象)
 * - `paragraph`: その他 (text はそのまま)
 */
export type SummaryLineKind = "heading" | "bullet" | "empty" | "paragraph";

export interface SummaryLine {
  kind: SummaryLineKind;
  text: string;
}

/**
 * 単一 line を分類する純粋関数。
 *
 * 非 string 入力は safe に `paragraph` で空文字を返す (caller の type 不一致時の防御)。
 */
export function parseSummaryLine(line: unknown): SummaryLine {
  // defensive: undefined / null / number / object 混入時の type safe fallback
  if (typeof line !== "string") {
    return { kind: "paragraph", text: "" };
  }
  if (line.startsWith("## ")) {
    return { kind: "heading", text: line.slice(3) };
  }
  if (/^[・\-•]\s/.test(line)) {
    return { kind: "bullet", text: line.replace(/^[・\-•]\s*/, "") };
  }
  if (line.trim() === "") {
    return { kind: "empty", text: "" };
  }
  return { kind: "paragraph", text: line };
}

/**
 * AI summary text 全体を line 単位で分類する純粋関数。
 *
 * - 非 string 入力 (#811 経路) は空配列で safe fallback
 * - 内部で `split("\n")` するため text の改行を維持
 * - `empty` line も配列に含めて caller (JSX 描画) が key 安定のため index を使えるようにする
 *
 * @example
 * parseSummaryLines("## H\n- bullet\nplain")
 *   // [{ kind: "heading", text: "H" }, { kind: "bullet", text: "bullet" }, { kind: "paragraph", text: "plain" }]
 * parseSummaryLines(undefined)  // []
 * parseSummaryLines(123)        // []
 */
export function parseSummaryLines(text: unknown): ReadonlyArray<SummaryLine> {
  if (typeof text !== "string") return [];
  return text.split("\n").map((line) => parseSummaryLine(line));
}
