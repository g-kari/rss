"use client";

import { useEffect } from "react";
import { updateFaviconBadge } from "../lib/favicon";

/**
 * 未読総数に応じて document.title と favicon バッジを同期する hook (#650 Step 1e)。
 *
 * - title: `(N) RSS Reader` / 未読 0 の場合は `RSS Reader`
 * - favicon: `updateFaviconBadge(N)` で動的にバッジ画像を生成
 *
 * favicon 描画は失敗しても UI 全体には影響しないため例外を握り潰す。
 */
export function useDocumentTitleBadge(totalUnread: number): void {
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) RSS Reader` : "RSS Reader";
    updateFaviconBadge(totalUnread).catch(() => {});
  }, [totalUnread]);
}
