"use client";

import { useState, useCallback } from "react";
import { storageSet } from "../lib/storage";

export function useStoredSetting<T extends string>(
  load: () => T,
  key: string,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(load);
  const onChange = useCallback(
    (v: T) => {
      setValue(v);
      storageSet(key, v);
    },
    [key],
  );
  return [value, onChange];
}
