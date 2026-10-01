import { useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export function acquireImmersiveSession() {
  count++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count--;
    emit();
  };
}
export function useHasImmersiveSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => count > 0,
    () => false,
  );
}
