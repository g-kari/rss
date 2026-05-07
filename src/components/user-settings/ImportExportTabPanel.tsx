"use client";

import { useRef, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import { downloadBlob } from "../../lib/download";

interface ImportExportTabPanelProps {
  hidden: boolean;
}

export default function ImportExportTabPanel({ hidden }: ImportExportTabPanelProps) {
  const toast = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const [opmlLoading, setOpmlLoading] = useState(false);

  const handleExport = async () => {
    if (opmlLoading) return;
    setOpmlLoading(true);
    try {
      const res = await fetch("/api/feeds/export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      downloadBlob(blob, "feeds.opml");
      toast.success("エクスポート完了");
    } catch {
      toast.error("エクスポートに失敗しました");
    } finally {
      setOpmlLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset so the same file can be selected again
    e.target.value = "";
    const MAX_OPML_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_OPML_FILE_SIZE) {
      toast.error("OPMLファイルのサイズが大きすぎます（上限5MB）");
      return;
    }
    setOpmlLoading(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/feeds/import", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: text,
      });
      const data = (await res.json()) as { added?: number; skipped?: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "インポートに失敗しました");
      } else {
        toast.success(`${data.added ?? 0}件追加、${data.skipped ?? 0}件スキップ`);
      }
    } catch {
      toast.error("インポートに失敗しました");
    } finally {
      setOpmlLoading(false);
    }
  };

  return (
    <div
      id="panel-import-export"
      role="tabpanel"
      aria-labelledby="tab-import-export"
      hidden={hidden}
    >
      <div className="flex flex-col gap-5 px-5 py-4">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          フィードのインポート / エクスポート
        </span>
        <div className="flex gap-2">
          {/* OPML エクスポート */}
          <button
            type="button"
            disabled={opmlLoading}
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            OPMLエクスポート
          </button>

          {/* OPML インポート */}
          <input
            ref={importRef}
            type="file"
            accept=".opml,.xml"
            className="hidden"
            onChange={handleImport}
          />
          <button
            type="button"
            disabled={opmlLoading}
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            OPMLインポート
          </button>
        </div>
      </div>
    </div>
  );
}
