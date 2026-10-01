/** Decorative arrivals only. This module never imports playback or reader-state logic. */
export const READER_ARRIVAL_LIMIT = 8;
export const READER_MOTION_SCAN_LIMIT = 64;

export function loadReaderAnimation() {
  return import("animejs/animation");
}

/** Read all geometry before animation writes; leave deep/large galleries static over the budget. */
export function visibleReaderItems(root: HTMLElement, eligible: ReadonlySet<string>) {
  if (root.closest("[inert]")) return [];
  const viewport = root.getBoundingClientRect();
  if (viewport.width <= 0 || viewport.height <= 0) return [];
  const targets: HTMLElement[] = [];
  let scanned = 0;
  for (const element of root.querySelectorAll<HTMLElement>('[role="article"]')) {
    const label = element.getAttribute("aria-labelledby") ?? "";
    if (!label.startsWith("article-title-") || !eligible.has(label.slice(14))) continue;
    if (++scanned > READER_MOTION_SCAN_LIMIT) break;
    const box = element.getBoundingClientRect();
    if (
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > viewport.top &&
      box.top < viewport.bottom &&
      box.right > viewport.left &&
      box.left < viewport.right
    )
      targets.push(element);
    if (targets.length === READER_ARRIVAL_LIMIT) break;
  }
  return targets;
}
