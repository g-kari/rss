"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/contexts/ToastContext";
import type { ToastApi } from "@/hooks/useToast";
import { TtsAdapterProvider } from "@/contexts/TtsAdapterContext";
import type { TtsAdapter } from "@/lib/tts-adapter";
import { ReaderSettingsProvider } from "@/contexts/ReaderSettingsContext";
import type { ReaderSettings } from "@/contexts/ReaderSettingsContext";
import { ArticleFilterProvider } from "@/contexts/ArticleFilterContext";
import type { ArticleFilter } from "@/contexts/ArticleFilterContext";

interface AppProvidersProps {
  toast: ToastApi;
  ttsAdapter: TtsAdapter;
  readerSettings: ReaderSettings;
  articleFilter: ArticleFilter;
  children: ReactNode;
}

/**
 * App.tsx の Provider 入れ子 (#650 Step 1u 抽出)。
 *
 * 4 段の Provider:
 * - `ToastProvider` — 全 UI 共通のトースト通知 API (`useToast()`)
 * - `TtsAdapterProvider` — TTS engine adapter を記事ヘッダー / 設定モーダルで共有
 * - `ReaderSettingsProvider` — フォントサイズ・行間・テーマ等の表示設定 (40 フィールド)
 * - `ArticleFilterProvider` — 記事フィルター状態 (FilterState + onSaveFilter)
 *
 * 順序の理由:
 * - Toast は全 UI 共通で最外周
 * - TtsAdapter はリーダー設定モーダル (内側) も参照する
 * - ReaderSettings は記事フィルター UI 内で参照する
 * - ArticleFilter は ThreePaneLayout 内のみで使用
 *
 * App.tsx の return JSX を「Provider 4 段 → 1 段」に簡素化し、
 * Provider の順序を本ファイルに閉じ込めることで、将来の Provider 追加・順序変更時の
 * 影響範囲を 1 ファイルに限定する。
 */
export default function AppProviders({
  toast,
  ttsAdapter,
  readerSettings,
  articleFilter,
  children,
}: AppProvidersProps) {
  return (
    <ToastProvider value={toast}>
      <TtsAdapterProvider value={ttsAdapter}>
        <ReaderSettingsProvider value={readerSettings}>
          <ArticleFilterProvider value={articleFilter}>{children}</ArticleFilterProvider>
        </ReaderSettingsProvider>
      </TtsAdapterProvider>
    </ToastProvider>
  );
}
