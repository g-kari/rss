"use client";

import { useCallback, useEffect, useRef } from "react";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "../hooks/useSyncedRef";

// Allow transient buffering, but never leave an active article waiting indefinitely.
export const CINEMATIC_VIDEO_STALL_TIMEOUT = 15_000;
const WATCHDOG_INTERVAL = 250;

interface Props {
  src: string;
  paused: boolean;
  pageVisible: boolean;
  speed: number;
  onProgress: (fraction: number) => void;
  onComplete: () => void;
  onFallback: () => void;
}

/** One active, silent native video; no player is mounted on neighboring cards. */
export default function CinematicVideo({
  src,
  paused,
  pageVisible,
  speed,
  onProgress,
  onComplete,
  onFallback,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const settled = useRef(false);
  const noProgressTime = useRef(0);
  const mediaTime = useRef(0);
  const callbacks = useSyncedRef({ onProgress, onComplete, onFallback });
  const watchdog = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const fallback = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    clearInterval(watchdog.current);
    ref.current?.pause();
    callbacks.current.onFallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks has stable identity.
  }, []);
  useEffect(() => {
    settled.current = false;
    noProgressTime.current = 0;
    mediaTime.current = 0;
  }, [src]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    let previousTick = performance.now();
    const accountProgress = () => {
      const now = performance.now();
      const current = video.currentTime;
      if (Number.isFinite(current) && current > mediaTime.current) {
        mediaTime.current = current;
        noProgressTime.current = 0;
      } else noProgressTime.current += Math.max(0, now - previousTick);
      previousTick = now;
    };
    video.muted = true;
    video.playbackRate = speed;
    if (!paused && pageVisible && !settled.current) {
      const fail = (error: unknown) => {
        if (cancelled) return;
        devError("[immersive] Video playback unavailable", error);
        fallback();
      };
      // Watch real media time, not waiting/stalled events or play() promise settlement.
      // Cleanup freezes this active-time budget during user pause/hidden tabs.
      watchdog.current = setInterval(() => {
        if (settled.current) return;
        accountProgress();
        if (noProgressTime.current >= CINEMATIC_VIDEO_STALL_TIMEOUT) {
          devError("[immersive] Video playback stopped progressing");
          fallback();
        }
      }, WATCHDOG_INTERVAL);
      try {
        void video.play().catch(fail);
      } catch (error) {
        fail(error);
      }
    } else video.pause();
    return () => {
      cancelled = true;
      // Preserve partial ticks too; repeated short pauses must not erase active wait.
      if (!paused && pageVisible && !settled.current) accountProgress();
      clearInterval(watchdog.current);
      video.pause();
    };
  }, [src, paused, pageVisible, speed, fallback]);
  return (
    <video
      ref={ref}
      src={src}
      className="cinematic-video"
      muted
      playsInline
      preload="metadata"
      aria-label="記事の動画（音声なし）"
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (!settled.current && Number.isFinite(video.duration) && video.duration > 0)
          callbacks.current.onProgress(Math.min(1, video.currentTime / video.duration));
      }}
      onEnded={() => {
        if (paused || !pageVisible || settled.current) return;
        settled.current = true;
        clearInterval(watchdog.current);
        callbacks.current.onComplete();
      }}
      onError={fallback}
    />
  );
}
