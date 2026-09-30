"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Timeline } from "animejs";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";

export const CINEMATIC_DURATION = 20_000;

interface PlaybackOptions {
  autoPlay?: boolean;
  paused?: boolean;
  speed?: number;
  duration?: number;
  onComplete?: () => void;
}

/** Finite image choreography; autoplay is limited to an explicitly opened immersive session. */
export function useCinematicPlayback(
  imageRef: RefObject<HTMLDivElement | null>,
  motionAllowed: boolean,
  pageVisible: boolean,
  {
    autoPlay = false,
    paused = false,
    speed = 1,
    duration = CINEMATIC_DURATION,
    onComplete,
  }: PlaybackOptions = {},
) {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const timelineRef = useRef<Timeline | null>(null);
  const completedRef = useRef(false);
  const canPlay = playing && motionAllowed && pageVisible && !paused;
  const canPlayRef = useSyncedRef(canPlay);
  const completeRef = useSyncedRef(onComplete);
  const speedRef = useSyncedRef(speed);

  useEffect(() => {
    if (!autoPlay || !motionAllowed || paused || started) return;
    setStarted(true);
    setPlaying(true);
  }, [autoPlay, motionAllowed, paused, started]);

  useEffect(() => {
    if (!started || !motionAllowed) return;
    let cancelled = false;
    let timeline: Timeline | undefined;
    let lastTick = -1;
    void import("animejs/timeline")
      .then(({ createTimeline }) => {
        if (cancelled || !imageRef.current) return;
        timeline = createTimeline({
          autoplay: false,
          onUpdate: (self) => {
            if (cancelled || !canPlayRef.current) return;
            const tick = Math.floor(self.currentTime / 250);
            if (tick !== lastTick) {
              lastTick = tick;
              setElapsed(Math.min(duration, self.currentTime));
            }
          },
          onComplete: () => {
            if (cancelled || !canPlayRef.current || completedRef.current) return;
            completedRef.current = true;
            setElapsed(duration);
            setPlaying(false);
            completeRef.current?.();
          },
        }).add(imageRef.current, {
          scale: [1, 1.1],
          x: [0, -8],
          y: [0, -4],
          duration,
          ease: "linear",
        });
        timeline.speed = speedRef.current;
        timelineRef.current = timeline;
        if (canPlayRef.current) timeline.play();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        devError("[cinematic] Animation unavailable", error);
        setFailed(true);
        setPlaying(false);
      });
    return () => {
      cancelled = true;
      timeline?.revert();
      timelineRef.current = null;
    };
    // Stable useSyncedRef: reloading on Play/Pause would reset the current shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, motionAllowed, imageRef, duration]);

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.speed = speed;
    if (canPlay) timelineRef.current?.play();
    else timelineRef.current?.pause();
  }, [canPlay, speed]);

  // A changed policy cancels the shot; the immersive parent keeps its session paused.
  useEffect(() => {
    if (motionAllowed) return;
    setPlaying(false);
    setStarted(false);
    setElapsed(0);
  }, [motionAllowed]);

  const toggle = () => {
    if (!motionAllowed || failed) return;
    if (elapsed >= duration) {
      completedRef.current = false;
      timelineRef.current?.seek(0, true);
      setElapsed(0);
    }
    setStarted(true);
    setPlaying((previous) => !previous);
  };
  return { playing: playing && !paused, elapsed, failed, toggle, finished: elapsed >= duration };
}
