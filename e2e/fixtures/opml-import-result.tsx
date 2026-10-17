// Production import hook/settings panel and toast UI; synthetic intercepted API only.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ImportExportTabPanel from "../../src/components/user-settings/ImportExportTabPanel";
import ToastContainer from "../../src/components/ToastContainer";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { useFeedOperations } from "../../src/hooks/useFeedOperations";
import { useToastState } from "../../src/hooks/useToast";
import { makeFeed } from "../helpers/feed";

function Fixture() {
  const toast = useToastState();
  const [feeds, setFeeds] = useState([
    makeFeed({ id: "existing-b", title: "Preserve B", url: "https://example.test/b.xml" }),
  ]);
  const [importedCalls, setImportedCalls] = useState(0);
  const { importing, importMessage, fileInputRef, handleImportFile } = useFeedOperations({
    onFeedAdded: () => {},
    onFeedDeleted: () => {},
    onFeedRenamed: () => {},
    onFeedsImported: (accepted) => {
      setImportedCalls((count) => count + 1);
      setFeeds((current) => [...current, ...accepted]);
    },
  });
  return (
    <ToastProvider value={toast}>
      <main className="min-h-dvh bg-surface-base p-4 text-text-strong">
        <section aria-label="サイドバーのインポート" className="mb-4 border p-3">
          <button type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            OPMLインポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml"
            className="hidden"
            onChange={handleImportFile}
          />
          {importMessage && (
            <p
              aria-label="サイドバーの結果"
              className={importMessage.isError ? "text-error" : "text-text-muted"}
            >
              {importMessage.text}
            </p>
          )}
          <output aria-label="追加callback回数">{importedCalls}</output>
          <output aria-label="現在の購読">{feeds.map((feed) => feed.id).join(",")}</output>
        </section>
        <section aria-label="設定のインポート">
          <ImportExportTabPanel
            userId="opml-synthetic-owner"
            hidden={false}
            articles={[]}
            notes={{}}
            setNote={() => {}}
            bookmarkIds={new Set()}
            readingListIds={new Set()}
            toggleBookmark={() => {}}
            toggleReadingList={() => {}}
            collections={[]}
            addArticlesToCollection={async () => {}}
          />
        </section>
      </main>
      <ToastContainer />
    </ToastProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
