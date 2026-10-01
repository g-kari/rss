/** Decorative arrivals only. This module never imports playback or reader-state logic. */
export const READER_ARRIVAL_LIMIT = 8;
export const READER_MOTION_SCAN_LIMIT = 64;

export function loadReaderAnimation() {
  return import("animejs/animation");
}

/** Read all geometry before animation writes; leave deep/large galleries static over the budget. */
export function measureVisibleReaderItems(
  root: HTMLElement,
  eligible: ReadonlySet<string>,
  budget = READER_MOTION_SCAN_LIMIT,
) {
  const result = { targets: [] as HTMLElement[], measurements: 0, ready: false };
  if (root.closest("[inert]")) return result;
  const viewport = root.getBoundingClientRect();
  if (viewport.width <= 0 || viewport.height <= 0) return result;
  for (const element of root.querySelectorAll<HTMLElement>('[role="article"]')) {
    const label = element.getAttribute("aria-labelledby") ?? "";
    if (!label.startsWith("article-title-") || !eligible.has(label.slice(14))) continue;
    if (result.measurements >= budget) break;
    result.measurements++;
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) result.ready = true;
    if (
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > viewport.top &&
      box.top < viewport.bottom &&
      box.right > viewport.left &&
      box.left < viewport.right
    )
      result.targets.push(element);
    if (result.targets.length === READER_ARRIVAL_LIMIT) break;
  }
  return result;
}
