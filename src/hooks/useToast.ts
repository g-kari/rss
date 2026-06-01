import { useState, useCallback, useMemo, useRef, useEffect } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "undo";
  onUndo?: () => void;
}

export interface ToastApi {
  toasts: ToastItem[];
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  undo: (message: string, onUndo: () => void) => void;
  dismiss: (id: string) => void;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 8000;
const UNDO_DURATION = 10000;

let nextId = 0;

/**
 * トースト通知の state + API (`success` / `error` / `info` / `undo` + dismiss) を集約管理する hook。`ToastProvider` 経由で配下に提供する用途。
 * @returns `ToastApi` (`{ toasts, success, error, info, undo, dismiss }`)
 */
export function useToastState(): ToastApi {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback((message: string, type: ToastItem["type"], onUndo?: () => void) => {
    const id = `toast-${++nextId}`;
    const duration =
      type === "error" ? ERROR_DURATION : type === "undo" ? UNDO_DURATION : DEFAULT_DURATION;

    setToasts((prev) => {
      const next = [...prev, { id, message, type, onUndo }];
      if (next.length > MAX_TOASTS) {
        const removed = next[0];
        const timer = timersRef.current.get(removed.id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(removed.id);
        }
        return next.slice(1);
      }
      return next;
    });

    timersRef.current.set(
      id,
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, duration),
    );
  }, []);

  const success = useCallback((message: string) => show(message, "success"), [show]);
  const error = useCallback((message: string) => show(message, "error"), [show]);
  const info = useCallback((message: string) => show(message, "info"), [show]);
  const undo = useCallback(
    (message: string, onUndoCb: () => void) => show(message, "undo", onUndoCb),
    [show],
  );

  return useMemo<ToastApi>(
    () => ({ toasts, success, error, info, undo, dismiss }),
    [toasts, success, error, info, undo, dismiss],
  );
}
