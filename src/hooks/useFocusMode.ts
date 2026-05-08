"use client";

import { useCallback, useRef, useState } from "react";
import { useEventListener } from "./useEventListener";
import { useSyncedRef } from "./useSyncedRef";

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
  setListFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  exitFocusMode: () => void;
} {
  const [focusMode, setFocusMode] = useState(false);
  const [listFocusMode, setListFocusMode] = useState(false);
  const focusModeRef = useSyncedRef(focusMode);
  const listFocusModeRef = useSyncedRef(listFocusMode);
  const focusHistoryRef = useRef(false);

  const pushFocusHistory = useCallback(() => {
    if (!focusHistoryRef.current) {
      focusHistoryRef.current = true;
      window.history.pushState({ focus: true }, "");
    }
  }, []);

  const exitFocusViaHistory = useCallback(() => {
    if (focusHistoryRef.current) {
      focusHistoryRef.current = false;
      window.history.back();
    } else {
      setFocusMode(false);
      setListFocusMode(false);
    }
  }, []);

  useEventListener("popstate", () => {
    if (!focusHistoryRef.current) return;
    if (window.history.state?.focus) return;
    focusHistoryRef.current = false;
    setFocusMode(false);
    setListFocusMode(false);
  });

  useEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "\\") {
        if (e.shiftKey) {
          if (listFocusModeRef.current) {
            exitFocusViaHistory();
          } else {
            pushFocusHistory();
            setListFocusMode(true);
            setFocusMode(false);
          }
        } else {
          if (focusModeRef.current) {
            exitFocusViaHistory();
          } else {
            pushFocusHistory();
            setFocusMode(true);
            setListFocusMode(false);
          }
        }
      }
      if (e.key === "Escape") {
        exitFocusViaHistory();
      }
    },
    document,
  );

  const toggleFocusMode = useCallback(() => {
    if (focusModeRef.current) {
      exitFocusViaHistory();
    } else {
      pushFocusHistory();
      setFocusMode(true);
      setListFocusMode(false);
    }
  }, [focusModeRef, exitFocusViaHistory, pushFocusHistory]);

  const toggleListFocusMode = useCallback(() => {
    if (listFocusModeRef.current) {
      exitFocusViaHistory();
    } else {
      pushFocusHistory();
      setListFocusMode(true);
      setFocusMode(false);
    }
  }, [listFocusModeRef, exitFocusViaHistory, pushFocusHistory]);

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
