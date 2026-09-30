"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Timeline } from "animejs";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";

export const CINEMATIC_DURATION = 20_000;

/** Lazy, finite image choreography. No playback or import until an explicit Play click. */
export function useCinematicPlayback(
  imageRef: RefObject<HTMLDivElement | null>,
  motionAllowed: boolean,
  pageVisible: boolean,
) {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const timelineRef = useRef<Timeline | null>(null);
  const canPlayRef = useSyncedRef(playing && motionAllowed && pageVisible);

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
            const tick = Math.floor(self.currentTime / 250);
            if (tick !== lastTick) {
              lastTick = tick;
              setElapsed(Math.min(CINEMATIC_DURATION, self.currentTime));
            }
          },
          onComplete: () => {
            setElapsed(CINEMATIC_DURATION);
            setPlaying(false);
          },
        }).add(imageRef.current, {
          scale: [1, 1.1],
          x: [0, -8],
          y: [0, -4],
          duration: CINEMATIC_DURATION,
          ease: "linear",
        });
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
  }, [started, motionAllowed, imageRef]);

  useEffect(() => {
    if (playing && motionAllowed && pageVisible) timelineRef.current?.play();
    else timelineRef.current?.pause();
  }, [playing, motionAllowed, pageVisible]);

  // A changed accessibility/device policy cancels the session; re-enabling never auto-restarts.
  useEffect(() => {
    if (motionAllowed) return;
    setPlaying(false);
    setStarted(false);
    setElapsed(0);
  }, [motionAllowed]);

  const toggle = () => {
    if (!motionAllowed || failed) return;
    if (elapsed >= CINEMATIC_DURATION) {
      timelineRef.current?.seek(0, true);
      setElapsed(0);
    }
    setStarted(true);
    setPlaying((previous) => !previous);
  };
  return { playing, elapsed, failed, toggle, finished: elapsed >= CINEMATIC_DURATION };
}
