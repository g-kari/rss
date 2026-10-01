"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { JSAnimation } from "animejs";
import { useVisualMode } from "../contexts/VisualModeContext";
import { loadReaderAnimation, visibleReaderItems } from "../lib/reader-motion";
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
    if (!allowed || eventKey === null || (!changedScope && (kind === "article" || !added.size)))
      return;

    let cancelled = false;
    const animations: JSAnimation[] = [];
    const elements: HTMLElement[] = [];
    const startedAt = performance.now();
    const frame = requestAnimationFrame(() => {
      void loadReaderAnimation()
        .then(({ animate }) => {
          const root = rootRef.current;
          // Late decoration must not make already-settled content jump or become translucent.
          if (cancelled || !root || performance.now() - startedAt > 150 || root.closest("[inert]"))
            return;
          const targets =
            kind === "list"
              ? visibleReaderItems(root, added)
              : [...root.querySelectorAll<HTMLElement>("[data-reader-arrival]")];
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
