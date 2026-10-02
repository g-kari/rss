import type { ReactNode } from "react";
import {
  ReaderSettingsProvider,
  type ReaderSettings,
} from "../../src/contexts/ReaderSettingsContext";
import { useLayoutSettings } from "../../src/hooks/useLayoutSettings";
import { useAccessibilitySettings } from "../../src/hooks/useAccessibilitySettings";
import { useThemePreference } from "../../src/hooks/useThemePreference";

const noop = () => {};
/** Real persistence hooks, with unrelated automatic operations disabled for local fixtures. */
export function TestReaderSettings({ children }: { children: ReactNode }) {
  const layout = useLayoutSettings();
  const accessibility = useAccessibilitySettings();
  const theme = useThemePreference();
  const value: ReaderSettings = {
    ...layout,
    ...accessibility,
    ...theme,
    focusMode: false,
    toggleFocusMode: noop,
    autoReadEnabled: false,
    toggleAutoRead: noop,
    autoReadThreshold: 90,
    cycleAutoReadThreshold: noop,
    onChangeAutoReadThreshold: noop,
    autoTranslate: false,
    toggleAutoTranslate: noop,
    autoSummarize: false,
    toggleAutoSummarize: noop,
    autoAiBrowserOnly: false,
    toggleAutoAiBrowserOnly: noop,
    deduplicateByLink: false,
    toggleDeduplicateByLink: noop,
    ttlDays: null,
    onChangeTtlDays: noop,
    aiProvider: "workers-ai",
    onChangeAiProvider: noop,
    aiUserId: null,
    aiModel: "@cf/meta/llama-3.1-8b-instruct",
    onChangeAiModel: noop,
  };
  return <ReaderSettingsProvider value={value}>{children}</ReaderSettingsProvider>;
}
