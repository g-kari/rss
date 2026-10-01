"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncedRef } from "./useSyncedRef";

/** Article timing is independent of decorative animation and device capability hints. */
export function useImmersiveClock(
  active: boolean,
  paused: boolean,
  pageVisible: boolean,
  speed: number,
  duration: number,
  onComplete?: () => void,
) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const completed = useRef(false);
  const completeRef = useSyncedRef(onComplete);
  useEffect(() => {
    if (!active || paused || !pageVisible || completed.current) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsedRef.current = Math.min(
        duration,
        elapsedRef.current + Math.max(0, now - previous) * speed,
      );
      previous = now;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= duration && !completed.current) {
        completed.current = true;
        window.clearInterval(timer);
        completeRef.current?.();
      }
    }, 100);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completeRef has stable identity.
  }, [active, paused, pageVisible, speed, duration]);
  return elapsed;
}
