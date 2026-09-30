"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";

interface VisualMode {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  motionEnabled: boolean;
  toggleMotion: () => void;
  motionAllowed: boolean;
  motionReason: string;
  pageVisible: boolean;
}

const defaultValue: VisualMode = {
  enabled: false,
  setEnabled: () => {},
  motionEnabled: true,
  toggleMotion: () => {},
  motionAllowed: false,
  motionReason: "静止表示",
  pageVisible: true,
};
const VisualModeContext = createContext<VisualMode>(defaultValue);

interface Connection extends EventTarget {
  saveData?: boolean;
}
interface DeviceHints {
  deviceMemory?: number;
  connection?: Connection;
}

/** One shared, device-local preference. Reader data/layout and the existing light/dark theme stay independent. */
export function VisualModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [motionReason, setMotionReason] = useState("静止表示");
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const load = () => {
      setEnabledState(storageGet(STORAGE_KEYS.VISUAL_MODE) === "cinema");
      setMotionEnabled(storageGet(STORAGE_KEYS.VISUAL_MOTION) !== "off");
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === STORAGE_KEYS.VISUAL_MODE ||
        event.key === STORAGE_KEYS.VISUAL_MOTION
      )
        load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const device = navigator as Navigator & DeviceHints;
    const update = () => {
      setMotionReason(
        reduced.matches
          ? "端末の動きを減らす設定"
          : device.connection?.saveData
            ? "データ節約設定"
            : (device.deviceMemory !== undefined && device.deviceMemory <= 4) ||
                (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2)
              ? "軽量表示"
              : "",
      );
      setPageVisible(document.visibilityState !== "hidden");
    };
    update();
    reduced.addEventListener("change", update);
    device.connection?.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      reduced.removeEventListener("change", update);
      device.connection?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const motionAllowed = enabled && motionEnabled && !motionReason;
  useEffect(() => {
    const root = document.documentElement;
    if (enabled) {
      root.dataset.visualMode = "cinema";
      root.dataset.visualMotion = motionAllowed && pageVisible ? "full" : "still";
    } else {
      delete root.dataset.visualMode;
      delete root.dataset.visualMotion;
    }
    return () => {
      delete root.dataset.visualMode;
      delete root.dataset.visualMotion;
    };
  }, [enabled, motionAllowed, pageVisible]);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    storageSet(STORAGE_KEYS.VISUAL_MODE, next ? "cinema" : "normal");
  }, []);
  const toggleMotion = useCallback(() => {
    setMotionEnabled((previous) => {
      storageSet(STORAGE_KEYS.VISUAL_MOTION, previous ? "off" : "on");
      return !previous;
    });
  }, []);
  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      motionEnabled,
      toggleMotion,
      motionAllowed,
      motionReason,
      pageVisible,
    }),
    [enabled, setEnabled, motionEnabled, toggleMotion, motionAllowed, motionReason, pageVisible],
  );
  return <VisualModeContext value={value}>{children}</VisualModeContext>;
}

export function useVisualMode() {
  return useContext(VisualModeContext);
}
