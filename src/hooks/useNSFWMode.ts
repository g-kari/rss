"use client";

import { useState, useCallback, useRef } from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";

/** NSFW 活性化に必要な連打回数 */
const NSFW_CLICK_COUNT = 5;
/** 連打として認識する時間ウィンドウ (ms) */
const NSFW_CLICK_WINDOW = 2000;

export function useNSFWMode() {
  const [nsfwMode, setNsfwMode] = useState(() => storageGet(STORAGE_KEYS.NSFW_MODE) === "1");
  const [showNSFWAnimation, setShowNSFWAnimation] = useState(false);
  const clickTimesRef = useRef<number[]>([]);
  const nsfwModeRef = useRef(nsfwMode);
  nsfwModeRef.current = nsfwMode;

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
