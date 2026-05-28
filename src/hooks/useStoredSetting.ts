"use client";

import { useState, useCallback } from "react";
import { storageSet } from "../lib/storage";

/**
 * 文字列 enum 設定を localStorage に永続化する汎用 hook。
 * @param load - 初期値ロード関数 (localStorage から読み出して T に復元)
 * @param key - localStorage key
 * @returns `[value, onChange]` 現在値 + setter
 */
export function useStoredSetting<T extends string>(
  load: () => T,
  key: string,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(load);
  const onChange = useCallback(
    (v: T) => {
      setValue(v);
      storageSet(key, v);
    },
    [key],
  );
  return [value, onChange];
}

/**
 * boolean トグル設定を localStorage に永続化する hook。
 *
 * `useAutoReadSettings` 等で 5+ 箇所に重複していた `useState + setX(v => !v) + storageSet`
 * パターンを 1 行に集約する。
 *
 * @param load - 初期値を localStorage から復元する関数
 * @param key - localStorage キー
 * @param onValue - true 時の永続化値（既定 "1"）
 * @param offValue - false 時の永続化値（既定 "0"）
 */
export function useStoredBoolToggle(
  load: () => boolean,
  key: string,
  onValue: string = "1",
  offValue: string = "0",
): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(load);
  const toggle = useCallback(() => {
    setValue((v) => {
      const next = !v;
      storageSet(key, next ? onValue : offValue);
      return next;
    });
  }, [key, onValue, offValue]);
  return [value, toggle];
}
