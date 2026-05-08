"use client";

import { useState, useCallback } from "react";

export interface UseAutoReadModeResult {
  autoMode: boolean;
  toggleAutoMode: () => void;
  enableAutoMode: () => void;
  disableAutoMode: () => void;
}

/**
 * オートモード（自動全文取得 → 読み上げ → 次の記事へ）の状態管理。
 *
 * 状態のみを保持し、副作用（TTS / fetchFullContent / onSelectNext）は
 * ArticleView 側の useEffect で処理する。
 */
export function useAutoReadMode(): UseAutoReadModeResult {
  const [autoMode, setAutoMode] = useState(false);
  const toggleAutoMode = useCallback(() => setAutoMode((v) => !v), []);
  const enableAutoMode = useCallback(() => setAutoMode(true), []);
  const disableAutoMode = useCallback(() => setAutoMode(false), []);
  return { autoMode, toggleAutoMode, enableAutoMode, disableAutoMode };
}
