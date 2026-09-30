"use client";

import { useEffect, useRef } from "react";
import { devError } from "../lib/dev-log";

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
  const completed = useRef(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    video.muted = true;
    video.playbackRate = speed;
    if (!paused && pageVisible) {
      void video.play().catch((error: unknown) => {
        if (cancelled) return;
        devError("[immersive] Video playback unavailable", error);
        onFallback();
      });
    } else video.pause();
    return () => {
      cancelled = true;
      video.pause();
    };
  }, [src, paused, pageVisible, speed, onFallback]);
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
        if (Number.isFinite(video.duration) && video.duration > 0)
          onProgress(Math.min(1, video.currentTime / video.duration));
      }}
      onEnded={() => {
        if (paused || !pageVisible || completed.current) return;
        completed.current = true;
        onComplete();
      }}
      onError={onFallback}
    />
  );
}
