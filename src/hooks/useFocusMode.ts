"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useEventListener } from "./useEventListener";
import { isEditableShortcutTarget } from "../lib/keyboard-target";
import { getPopupOpenCount } from "../lib/popup-lock";
import { useSyncedRef } from "./useSyncedRef";

const focusHistoryExits = new WeakMap<PopStateEvent, "open" | "closing">();
const focusHistoryOwners = new Set<RefObject<"idle" | "open" | "closing">>();

/** Pane changes stay within the single entry owned by a live focus hook. */
export function hasFocusHistoryOwner(): boolean {
  return focusHistoryOwners.size > 0;
}

/** Session metadata may be replaced by Next; live focus ownership still identifies its exit. */
export function getFocusHistoryExit(event: PopStateEvent): "open" | "closing" | undefined {
  return focusHistoryExits.get(event);
}

/**
 * 記事ビュー / 記事一覧 のフォーカスモード制御。
 *
 * - focusMode (記事ビューを最大化)
 * - listFocusMode (記事一覧を最大化)
 * - 両者は排他（片方が ON なら他方は OFF）
 * - 起動時に history.pushState を積み、popstate で OFF に戻す（ブラウザ「戻る」で抜けられる）
 * - キーボード: \\ で記事ビューフォーカス、Shift+\\ で記事一覧フォーカス、Escape で抜ける
 */
export function useFocusMode(): {
  focusMode: boolean;
  listFocusMode: boolean;
  toggleFocusMode: () => void;
  toggleListFocusMode: () => void;
  setListFocusMode: Dispatch<SetStateAction<boolean>>;
  exitFocusMode: () => void;
} {
  const [focusMode, setFocusMode] = useState(false);
  const [listFocusMode, setListFocusMode] = useState(false);
  const focusModeRef = useSyncedRef(focusMode);
  const listFocusModeRef = useSyncedRef(listFocusMode);
  const focusHistoryRef = useRef<"idle" | "open" | "closing">("idle");

  useEffect(
    () => () => {
      focusHistoryOwners.delete(focusHistoryRef);
    },
    [],
  );

  const pushFocusHistory = useCallback(() => {
    // A previous Back is asynchronous. Do not push a new mode in front of it.
    if (focusHistoryRef.current === "closing") return false;
    if (focusHistoryRef.current === "idle") {
      // Forward/reload may land on a departed focus entry with no live owner.
      // Make that base non-focus before adding the new entry we actually own.
      if (window.history.state?.focus)
        window.history.replaceState({ ...window.history.state, focus: false }, "");
      window.history.pushState({ ...window.history.state, focus: true }, "");
      focusHistoryRef.current = "open";
      focusHistoryOwners.add(focusHistoryRef);
    }
    return true;
  }, []);

  const exitFocusViaHistory = useCallback(() => {
    // Keep the mode and its focus trap until asynchronous Back completes.
    // Revealing the underlying panes sooner would let a new click push history
    // in front of the pending traversal. Repeated close requests own one Back.
    if (focusHistoryRef.current === "open") {
      focusHistoryRef.current = "closing";
      window.history.back();
    } else if (focusHistoryRef.current === "idle") {
      setFocusMode(false);
      setListFocusMode(false);
    }
  }, []);

  useEventListener(
    "popstate",
    (event) => {
      if (focusHistoryRef.current === "idle") return;
      // A requested exit is complete on traversal even if a later history write
      // races it. An old focus marker must not strand the closing guard.
      if (focusHistoryRef.current === "open" && window.history.state?.focus) return;
      focusHistoryExits.set(event, focusHistoryRef.current);
      focusHistoryRef.current = "idle";
      focusHistoryOwners.delete(focusHistoryRef);
      setFocusMode(false);
      setListFocusMode(false);
    },
    window,
    true,
  );

  useEventListener(
    "keydown",
    (e) => {
      // Sample trusted popup ownership before an inner dialog's close removes
      // its lock. Real traps own Escape, including createRoot(document) events.
      if (e.key === "Escape" && !isEditableShortcutTarget(e.target) && getPopupOpenCount() === 0)
        exitFocusViaHistory();
    },
    document,
    true,
  );

  useEventListener(
    "keydown",
    (e) => {
      if (isEditableShortcutTarget(e.target)) return;
      if (e.key === "\\") {
        if (e.shiftKey) {
          if (listFocusModeRef.current) {
            exitFocusViaHistory();
          } else if (pushFocusHistory()) {
            setListFocusMode(true);
            setFocusMode(false);
          }
        } else {
          if (focusModeRef.current) {
            exitFocusViaHistory();
          } else if (pushFocusHistory()) {
            setFocusMode(true);
            setListFocusMode(false);
          }
        }
      }
    },
    document,
  );

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleFocusMode = useCallback(() => {
    if (focusModeRef.current) {
      exitFocusViaHistory();
    } else if (pushFocusHistory()) {
      setFocusMode(true);
      setListFocusMode(false);
    }
  }, [exitFocusViaHistory, pushFocusHistory]);

  // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleListFocusMode = useCallback(() => {
    if (listFocusModeRef.current) {
      exitFocusViaHistory();
    } else if (pushFocusHistory()) {
      setListFocusMode(true);
      setFocusMode(false);
    }
  }, [exitFocusViaHistory, pushFocusHistory]);

  const exitFocusMode = useCallback(() => {
    exitFocusViaHistory();
  }, [exitFocusViaHistory]);

  return {
    focusMode,
    listFocusMode,
    toggleFocusMode,
    toggleListFocusMode,
    setListFocusMode,
    exitFocusMode,
  };
}
