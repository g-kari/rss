"use client";

import { useEffect, useSyncExternalStore } from "react";
import { acquirePopupLock, subscribePopupLock, getPopupOpenCount } from "../lib/popup-lock";

/**
 * ポップアップ（モーダル・ドロップダウン等）表示中にグローバルロックへ登録する。
 *
 * `active` が true の間だけ登録され、false になる or アンマウントで自動解除される。
 * デフォルトは true なので、条件付きでマウントされる Portal 系コンポーネントは
 * 引数なしで `usePopupLock()` を呼べばよい。
 */
export function usePopupLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const release = acquirePopupLock();
    return release;
  }, [active]);
}

/** ポップアップが 1 つ以上開いているかを React に購読した形で返す。 */
export function useHasOpenPopup(): boolean {
  const count = useSyncExternalStore(subscribePopupLock, getPopupOpenCount, () => 0);
  return count > 0;
}
