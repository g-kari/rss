// Actual status components with synthetic feed data. No retry or settings actions are wired.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import FeedDetailModal from "../../src/components/FeedDetailModal";
import FeedTitleContent from "../../src/components/feed-item/FeedTitleContent";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { makeFeed } from "../helpers/feed";

const noop = () => {};
document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";

function Preview() {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState(5);
  const feed = makeFeed({
    title: "技術ニュースのフィード",
    url: "https://example.test/engineering/rss.xml",
    siteUrl: "https://example.test",
    lastFetchedAt: "2026-09-30T00:30:40Z",
    consecutiveErrors: errors,
    fetchError: errors ? "Response closed due to connection limit" : null,
    lastErrorAt: errors ? "2026-09-30T03:00:55Z" : null,
  });
  return (
    <ToastProvider
      value={{ toasts: [], success: noop, error: noop, info: noop, undo: noop, dismiss: noop }}
    >
      <main className="p-4 space-y-4 text-text-default">
        <label className="block">
          連続エラーの状態
          <select
            aria-label="連続エラーの状態"
            value={errors}
            onChange={(event) => setErrors(Number(event.target.value))}
            className="block p-2 bg-surface-elevated border border-border-default"
          >
            <option value={5}>5回連続</option>
            <option value={4}>4回連続</option>
            <option value={0}>回復済み</option>
          </select>
        </label>
        <div className="max-w-[300px] p-3 border border-border-default" aria-label="フィード行">
          <FeedTitleContent
            feed={feed}
            isSelected
            isStale={false}
            isMuted={false}
            hasFilter={false}
          />
        </div>
        <button
          className="p-3 border border-border-default rounded-lg"
          onClick={() => setOpen(true)}
        >
          フィード詳細を開く
        </button>
      </main>
      {open && <FeedDetailModal feed={feed} onClose={() => setOpen(false)} />}
    </ToastProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
