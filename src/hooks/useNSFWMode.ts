"use client";

import { useState, useCallback, useRef } from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import { useSyncedRef } from "./useSyncedRef";

/** NSFW 活性化に必要な連打回数 */
const NSFW_CLICK_COUNT = 5;
/** 連打として認識する時間ウィンドウ (ms) */
const NSFW_CLICK_WINDOW = 2000;

/**
 * NSFW モードの有効化・無効化を管理するフック。
 *
 * `activateNSFW` を `NSFW_CLICK_WINDOW` ms 以内に `NSFW_CLICK_COUNT` 回呼ぶと
 * `showNSFWAnimation` が true になり、アニメーション完了後に NSFW モードが有効化される。
 * モードは localStorage に永続化されるため、ページリロード後も状態を維持する。
 *
 * @returns nsfwMode - NSFW モードが有効かどうか
 * @returns showNSFWAnimation - アクティベーションアニメーションを表示するか
 * @returns activateNSFW - 連打カウンターをインクリメントする関数
 * @returns deactivateNSFW - NSFW モードを無効化する関数
 * @returns onNSFWAnimationComplete - アニメーション完了時のコールバック
 */
export function useNSFWMode() {
  const [nsfwMode, setNsfwMode] = useState(() => storageGet(STORAGE_KEYS.NSFW_MODE) === "1");
  const [showNSFWAnimation, setShowNSFWAnimation] = useState(false);
  const clickTimesRef = useRef<number[]>([]);
  const nsfwModeRef = useSyncedRef(nsfwMode);

  const activateNSFW = useCallback(() => {
    const now = Date.now();
    const times = clickTimesRef.current;
    times.push(now);
    if (times.length > NSFW_CLICK_COUNT) times.shift();
    if (times.length === NSFW_CLICK_COUNT && now - times[0] < NSFW_CLICK_WINDOW) {
      clickTimesRef.current = [];
      if (!nsfwModeRef.current) {
        setShowNSFWAnimation(true);
      }
    }
  }, []);

  const deactivateNSFW = useCallback(() => {
    setNsfwMode(false);
    storageSet(STORAGE_KEYS.NSFW_MODE, "0");
  }, []);

  const onNSFWAnimationComplete = useCallback(() => {
    setShowNSFWAnimation(false);
    setNsfwMode(true);
    storageSet(STORAGE_KEYS.NSFW_MODE, "1");
  }, []);

  return { nsfwMode, showNSFWAnimation, activateNSFW, deactivateNSFW, onNSFWAnimationComplete };
}
