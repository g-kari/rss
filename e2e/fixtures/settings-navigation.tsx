// Production settings modal and persistence hooks; synthetic account/feed data only.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import UserSettingsModal from "../../src/components/UserSettingsModal";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { TtsAdapterProvider } from "../../src/contexts/TtsAdapterContext";
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import { useSpeechSynthesis } from "../../src/hooks/useSpeechSynthesis";
import { useToastState } from "../../src/hooks/useToast";
import { makeFeed } from "../helpers/feed";
import { TestReaderSettings } from "../helpers/reader-settings";

declare global {
  interface Window {
    settingsActions: string[];
    settingsRetainedControl?: Element;
  }
}
window.settingsActions = [];
const emptyIds = new Set<string>();
const feeds = [makeFeed({ id: "settings-feed", title: "設定テストのフィード" })];
const record = (action: string) => () => window.settingsActions.push(action);

function SettingsPreview() {
  const [open, setOpen] = useState(false);
  const tts = useSpeechSynthesis();
  const toast = useToastState();
  return (
    <TtsAdapterProvider value={tts}>
      <ToastProvider value={toast}>
        <main className="min-h-dvh bg-surface-base p-4 text-text-strong">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[44px] rounded-lg border border-border-default px-3 text-[13px]"
          >
            ユーザー設定を開く
          </button>
          {open && (
            <UserSettingsModal
              userId="settings-fixture-account"
              onClose={() => setOpen(false)}
              feeds={feeds}
              articles={[]}
              setNote={record("note")}
              bookmarkIds={emptyIds}
              readingListIds={emptyIds}
              toggleBookmark={record("bookmark")}
              toggleReadingList={record("reading-list")}
              collections={[]}
              addArticlesToCollection={async () => {
                window.settingsActions.push("collection");
              }}
            />
          )}
        </main>
      </ToastProvider>
    </TtsAdapterProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <VisualModeProvider>
    <TestReaderSettings>
      <SettingsPreview />
    </TestReaderSettings>
  </VisualModeProvider>,
);
