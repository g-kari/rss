import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";

interface ColumnConfig {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

const COLUMN_CONFIGS: Record<"sidebar" | "list", ColumnConfig> = {
  sidebar: {
    storageKey: STORAGE_KEYS.SIDEBAR_WIDTH,
    defaultWidth: 200,
    minWidth: 150,
    maxWidth: 400,
  },
  list: {
    storageKey: STORAGE_KEYS.LIST_WIDTH,
    defaultWidth: 360,
    minWidth: 200,
    maxWidth: 600,
  },
};

/**
 * 各カラムの幅制限 (px)。`ColumnResizeHandles` の WAI-ARIA Separator pattern
 * `aria-valuemin` / `aria-valuemax` 表示に流用する。
 */
export const COLUMN_LIMITS = {
  sidebar: { min: COLUMN_CONFIGS.sidebar.minWidth, max: COLUMN_CONFIGS.sidebar.maxWidth },
  list: { min: COLUMN_CONFIGS.list.minWidth, max: COLUMN_CONFIGS.list.maxWidth },
} as const;

/**
 * localStorage から保存済み幅を読み込む。
 * 無効・範囲外の値は minWidth〜maxWidth にクランプして返す。
 */
function loadWidth(config: ColumnConfig): number {
  const n = parseInt(storageGet(config.storageKey) ?? "", 10);
  return isNaN(n) ? config.defaultWidth : Math.max(config.minWidth, Math.min(config.maxWidth, n));
}

/**
 * サイドバー・記事リスト列のリサイズ操作と幅の永続化を管理するフック。
 *
 * - `handleResizeStart` をリサイズハンドルの `onMouseDown` に渡す
 * - ドラッグ中は mousemove で幅をリアルタイム更新し、mouseup で終了
 * - 幅の変化は即座に localStorage に保存（ページリロード後も復元される）
 * - `resetWidth` でデフォルト幅に戻す
 */
export function useColumnResize() {
  const [sidebarWidth, setSidebarWidth] = useState(() => loadWidth(COLUMN_CONFIGS.sidebar));
  const [listWidth, setListWidth] = useState(() => loadWidth(COLUMN_CONFIGS.list));

  const dragRef = useRef<{
    column: "sidebar" | "list";
    startX: number;
    startWidth: number;
  } | null>(null);
  const listenersRef = useRef<{
    onMouseMove: (ev: MouseEvent) => void;
    onMouseUp: () => void;
  } | null>(null);

  function handleResizeStart(column: "sidebar" | "list", e: ReactMouseEvent) {
    e.preventDefault();

    // mouseup が未発火のまま次のドラッグが始まった場合（ウィンドウ外離脱等）の二重登録を防ぐ
    if (listenersRef.current) {
      document.removeEventListener("mousemove", listenersRef.current.onMouseMove);
      document.removeEventListener("mouseup", listenersRef.current.onMouseUp);
      listenersRef.current = null;
    }

    const startWidth = column === "sidebar" ? sidebarWidth : listWidth;
    dragRef.current = { column, startX: e.clientX, startWidth };

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const { column: col, startX, startWidth: sw } = dragRef.current;
      const { minWidth, maxWidth, storageKey } = COLUMN_CONFIGS[col];
      const w = Math.max(minWidth, Math.min(maxWidth, sw + ev.clientX - startX));
      if (col === "sidebar") {
        setSidebarWidth(w);
      } else {
        setListWidth(w);
      }
      storageSet(storageKey, String(w));
    }

    function onMouseUp() {
      dragRef.current = null;
      listenersRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    listenersRef.current = { onMouseMove, onMouseUp };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // ウィンドウフォーカス喪失時にドラッグを強制終了（mouseup 未発火対策）
  useEffect(() => {
    function handleBlur() {
      if (listenersRef.current) {
        document.removeEventListener("mousemove", listenersRef.current.onMouseMove);
        document.removeEventListener("mouseup", listenersRef.current.onMouseUp);
        listenersRef.current = null;
        dragRef.current = null;
      }
    }
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  function resetWidth(column: "sidebar" | "list") {
    const { defaultWidth, storageKey } = COLUMN_CONFIGS[column];
    if (column === "sidebar") {
      setSidebarWidth(defaultWidth);
    } else {
      setListWidth(defaultWidth);
    }
    storageSet(storageKey, String(defaultWidth));
  }

  /**
   * キーボード操作 (WAI-ARIA Separator pattern の ArrowLeft / ArrowRight 等) で
   * 現在幅を deltaPx ぶん変化させる。`minWidth` / `maxWidth` で自動クランプ、localStorage 同期保存。
   *
   * (#887 WCAG 2.1.1 Keyboard 準拠のため追加)
   */
  const nudgeWidth = useCallback((column: "sidebar" | "list", deltaPx: number) => {
    const { minWidth, maxWidth, storageKey } = COLUMN_CONFIGS[column];
    const setter = column === "sidebar" ? setSidebarWidth : setListWidth;
    setter((prev) => {
      const next = Math.max(minWidth, Math.min(maxWidth, prev + deltaPx));
      if (next !== prev) storageSet(storageKey, String(next));
      return next;
    });
  }, []);

  return { sidebarWidth, listWidth, handleResizeStart, resetWidth, nudgeWidth };
}
