/**
 * モーダル・ドロップダウン等のオーバーレイ表示状態を管理する小さなグローバルストア。
 *
 * ポップアップ表示中は幅調整バーなど背後の UI 要素を無効化するのに使う。
 * 複数のポップアップが同時に開く場合を考慮してカウンターで管理する。
 */

let openCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/**
 * ポップアップ表示を 1 つ登録する。返却された関数を呼ぶと登録解除される。
 * コンポーネントの useEffect セットアップ → クリーンアップの流れで使う想定。
 */
export function acquirePopupLock(): () => void {
  openCount++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount = Math.max(0, openCount - 1);
    emit();
  };
}

/** ストアの変更を購読する。listener を登録し、解除関数を返す。 */
export function subscribePopupLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 現在開いているポップアップ数を返す（useSyncExternalStore の getSnapshot 用）。 */
export function getPopupOpenCount(): number {
  return openCount;
}
