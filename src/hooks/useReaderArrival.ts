"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { JSAnimation } from "animejs";
import { useVisualMode } from "../contexts/VisualModeContext";
import {
  loadReaderAnimation,
  measureVisibleReaderItems,
  READER_MOTION_SCAN_LIMIT,
} from "../lib/reader-motion";
import { devError } from "../lib/dev-log";

const NO_ITEMS: readonly string[] = [];

/** Finite incoming decoration. A consumed event never replays on scroll, policy or visibility return. */
export function useReaderArrival(
  rootRef: RefObject<HTMLElement | null>,
  kind: "article" | "list",
  eventKey: string | null,
  itemIds: readonly string[] = NO_ITEMS,
) {
  const { motionAllowed, pageVisible } = useVisualMode();
  const allowed = motionAllowed && pageVisible;
  const itemSignature = JSON.stringify(itemIds);
  const previousRef = useRef<{ key: string | null; ids: Set<string> } | null>(null);

  useEffect(() => {
    const ids = new Set<string>(JSON.parse(itemSignature));
    const previous = previousRef.current;
    previousRef.current = { key: eventKey, ids };
    const changedScope = !previous || previous.key !== eventKey;
    const added = changedScope ? ids : new Set([...ids].filter((id) => !previous.ids.has(id)));
    if (
      !allowed ||
      eventKey === null ||
      (kind === "list" && !added.size) ||
      (!changedScope && kind === "article")
    )
      return;

    let cancelled = false;
    const animations: JSAnimation[] = [];
    const elements: HTMLElement[] = [];
    const startedAt = performance.now();
    let remainingMeasurements = READER_MOTION_SCAN_LIMIT;
    let retried = false;
    let frame = requestAnimationFrame(() => {
      void loadReaderAnimation()
        .then(({ animate }) => {
          const arrive = () => {
            const root = rootRef.current;
            // Late decoration must not make already-settled content jump or become translucent.
            if (
              cancelled ||
              !root ||
              performance.now() - startedAt > 150 ||
              root.closest("[inert]")
            )
              return;
            let targets: HTMLElement[];
            if (kind === "list") {
              const measured = measureVisibleReaderItems(root, added, remainingMeasurements);
              remainingMeasurements -= measured.measurements;
              // Delayed list/virtualizer commits may miss the first frame. Retry once only,
              // sharing the original deadline and scan budget; settled/offscreen items never replay.
              if (!measured.ready && !retried && remainingMeasurements > 0) {
                retried = true;
                frame = requestAnimationFrame(() => {
                  void Promise.resolve()
                    .then(arrive)
                    .catch((error: unknown) => {
                      if (!cancelled) devError("[reader-motion] Decoration unavailable", error);
                    });
                });
                return;
              }
              targets = measured.targets;
            } else targets = [...root.querySelectorAll<HTMLElement>("[data-reader-arrival]")];
            targets.forEach((element, index) => {
              const part = element.dataset.readerArrival;
              elements.push(element);
              element.dataset.readerAnimating = "true";
              animations.push(
                animate(element, {
                  ...(part === "body" ? {} : { y: [kind === "list" ? 16 : 14, 0] }),
                  opacity: [part === "body" ? 0.85 : 0.75, 1],
                  duration: kind === "list" ? 240 : part === "body" ? 180 : 260,
                  delay: kind === "list" ? index * 25 : part === "meta" ? 30 : 0,
                  ease: "out(3)",
                  onComplete: (animation) => {
                    if (cancelled) return;
                    animation.revert();
                    delete element.dataset.readerAnimating;
                  },
                }),
              );
            });
          };
          arrive();
        })
        .catch((error: unknown) => {
          if (!cancelled) devError("[reader-motion] Decoration unavailable", error);
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      for (const animation of animations) animation.revert();
      for (const element of elements) delete element.dataset.readerAnimating;
    };
  }, [allowed, eventKey, itemSignature, kind, rootRef]);
}
