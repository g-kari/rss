/**
 * 読書進捗トラッキングユーティリティ
 *
 * IntersectionObserver で現在の可視要素インデックスを受け取り、
 * 進捗率 (0-100) と復元用アンカーセレクタを計算する純粋関数を提供する。
 */

// ===== 進捗計算 =====

/**
 * 現在の可視要素インデックスと全要素数から進捗率 (0-100 の整数) を計算する。
 *
 * @param visibleIndex - IntersectionObserver で最後に確認した要素の 0 始まりインデックス
 * @param totalElements - 追跡対象要素の総数
 * @returns 0〜100 の整数 (%)
 */
export function computeProgress(visibleIndex: number, totalElements: number): number {
  if (totalElements <= 0) return 0;
  if (visibleIndex >= totalElements) return 100;
  if (visibleIndex <= 0) return 0;
  return Math.round((visibleIndex / (totalElements - 1)) * 100);
}

// ===== 進捗のクランプ =====

/**
 * 読了とみなすしきい値 (95% 以上は 100 に丸める)。
 * 最後の数要素を読み飛ばしても「完読」と扱うため。
 */
const COMPLETION_THRESHOLD = 95;

/**
 * 進捗率を正規化する。
 * - 0 未満 → 0
 * - 95 以上 → 100
 * - それ以外 → そのまま
 */
export function clampProgress(progress: number): number {
  if (progress < 0) return 0;
  if (progress > 100) return 100;
  if (progress >= COMPLETION_THRESHOLD) return 100;
  return progress;
}

// ===== アンカーセレクタ生成 =====

/**
 * 要素インデックスから復元用 CSS セレクタを生成する。
 *
 * 先頭 (index 0) はページトップなので空文字を返す。
 * 負のインデックスも空文字を返す。
 *
 * @param index - 0 始まりの要素インデックス
 * @returns `.article-content > :nth-child(N)` 形式のセレクタ、または空文字
 */
export function buildAnchorSelector(index: number): string {
  if (index <= 0) return "";
  // :nth-child は 1 始まり
  return `.article-content > :nth-child(${index + 1})`;
}

/**
 * `buildAnchorSelector` が生成する `.article-content > :nth-child(N)` を、
 * contentRef.current (= .article-content 要素自身) を起点に `querySelector` するための
 * `:scope` 相対セレクタへ変換する。
 *
 * 復元時に `document.querySelector` で global 検索すると、listFocusMode の overlay と
 * メインビューで `.article-content` が複数存在するとき document 順で最初 (別記事) に
 * マッチする。`element.querySelector(":scope > :nth-child(N)")` で自身の subtree に限定する。
 * 先頭が `.article-content` でないセレクタ (将来変更時) はそのまま返す。
 */
export function scopeAnchorToContent(anchor: string): string {
  return anchor.replace(/^\.article-content\b/, ":scope");
}
