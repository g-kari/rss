"use client";

import { useState, useCallback, useEffect } from "react";
import { storageGet, storageSet, STORAGE_KEYS } from "../lib/storage";
import {
  parsePersistedAutoReadState,
  serializeAutoReadState,
  shouldRestoreAutoMode,
} from "../lib/auto-read-persist";

export interface UseAutoReadModeResult {
  autoMode: boolean;
  toggleAutoMode: () => void;
  enableAutoMode: () => void;
  disableAutoMode: () => void;
}

/** リロード時の初期値: localStorage に保存された state から復元 (1 時間以内のみ)。 */
function loadInitialAutoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = storageGet(STORAGE_KEYS.AUTO_READ_MODE_STATE);
    return shouldRestoreAutoMode(parsePersistedAutoReadState(raw), Date.now());
  } catch {
    return false;
  }
}

/**
 * オートモード（自動全文取得 → 読み上げ → 次の記事へ）の状態管理。
 *
 * #679: 案 A 実装で `localStorage` に永続化し、保存から **1 時間以内** ならリロード後に
 * 自動再開する。期限超過 / 時計戻り / 不正データ時は OFF で起動。
 *
 * 状態のみを保持し、副作用（TTS / fetchFullContent / onSelectNext）は
 * ArticleView 側の useEffect で処理する。
 */
export function useAutoReadMode(): UseAutoReadModeResult {
  const [autoMode, setAutoMode] = useState<boolean>(loadInitialAutoMode);

  // autoMode 変化を localStorage に書き込む。書き込みは toggle / enable / disable で
  // 必ず発火するように useEffect で集約 (各 setter で個別に書くより一貫性が高い)。
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      storageSet(STORAGE_KEYS.AUTO_READ_MODE_STATE, serializeAutoReadState(autoMode, Date.now()));
    } catch {
      /* localStorage が使えない環境ではサイレント */
    }
  }, [autoMode]);

  const toggleAutoMode = useCallback(() => setAutoMode((v) => !v), []);
  const enableAutoMode = useCallback(() => setAutoMode(true), []);
  const disableAutoMode = useCallback(() => setAutoMode(false), []);
  return { autoMode, toggleAutoMode, enableAutoMode, disableAutoMode };
}
