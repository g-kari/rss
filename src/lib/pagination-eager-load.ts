/**
 * 記事一覧の eager load 判定純粋関数 (#636)。
 *
 * クライアント側ページネーション (`useArticlePagination`) で
 * 「次ページを即時 load すべきか」を、副作用なしで判定する。
 *
 * 二つのトリガー条件を OR で評価する:
 *
 * 1. **sentinel が IntersectionObserver で交差中**
 *    通常の無限スクロール経路。ユーザーが下端付近までスクロールしたケース。
 *
 * 2. **コンテンツが viewport を埋めていない (`isContentShort`)**
 *    masonic ギャラリーで列が偏ったとき、最長列の底にある sentinel に
 *    届かなくても、最短列にはまだ余白がある状態。ユーザーから見ると
 *    「画面に空きがあるのに次が出ない」体験になるため、追加で発火させる。
 */

export interface EagerLoadState {
  /** sentinel 要素が IntersectionObserver で交差中か */
  isIntersecting: boolean;
  /** scrollContainer の中身が viewport を埋めていないか (`scrollHeight <= clientHeight`) */
  isContentShort: boolean;
  /** クライアント側ページネーションでまだ読み込めるアイテムが残っているか */
  hasMore: boolean;
  /** 現在の連続 eager load 回数 */
  count: number;
  /** 連続 eager load の上限（無限ループ防止） */
  max: number;
}

/**
 * 「次ページを即時 load すべきか」を判定する。
 *
 * - `hasMore` が false なら常に false（読み込めるアイテムがない）
 * - `count >= max` なら false（暴走防止カウンタ到達）
 * - それ以外は `isIntersecting || isContentShort` で発火
 */
export function shouldEagerLoad(state: EagerLoadState): boolean {
  if (!state.hasMore) return false;
  if (state.count >= state.max) return false;
  return state.isIntersecting || state.isContentShort;
}
