import { useEffect, type RefObject } from "react";

/** Let focused native controls own Space before the document-level reader shortcut. */
export function useNativeControlSpace(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const handle = (event: KeyboardEvent) => {
      if (
        event.key === " " &&
        event.target instanceof Element &&
        event.target.closest("button, summary")
      )
        event.stopPropagation();
    };
    element.addEventListener("keydown", handle);
    return () => element.removeEventListener("keydown", handle);
  }, [ref]);
}
