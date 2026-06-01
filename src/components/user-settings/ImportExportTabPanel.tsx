"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useToast } from "@/contexts/ToastContext";
import { downloadBlob } from "../../lib/download";
import { apiFetch } from "../../lib/api-fetch";
import { devError } from "../../lib/dev-log";

interface ImportExportTabPanelProps {
  hidden: boolean;
}

export default function ImportExportTabPanel({ hidden }: ImportExportTabPanelProps) {
  const toast = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const [opmlLoading, setOpmlLoading] = useState(false);
  const [clipUrlCopied, setClipUrlCopied] = useState(false);

  const CLIP_URL = "https://rss.0g0.xyz/api/clip";

  const handleExport = async () => {
    if (opmlLoading) return;
    setOpmlLoading(true);
    try {
      const res = await apiFetch("/api/feeds/export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      downloadBlob(blob, "feeds.opml");
      toast.success("エクスポート完了");
    } catch (err) {
      devError("[ImportExportTabPanel] handleExport failed", err);
      toast.error("エクスポートに失敗しました");
    } finally {
      setOpmlLoading(false);
    }
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
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
      const res = await apiFetch("/api/feeds/import", {
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
    } catch (err) {
      devError("[ImportExportTabPanel] handleImport failed", err);
      toast.error("インポートに失敗しました");
    } finally {
      setOpmlLoading(false);
    }
  };

  const handleCopyClipUrl = async () => {
    try {
      await navigator.clipboard.writeText(CLIP_URL);
      setClipUrlCopied(true);
      setTimeout(() => setClipUrlCopied(false), 2000);
    } catch (err) {
      devError("[ImportExportTabPanel] handleCopyClipUrl failed", err);
      toast.error("コピーに失敗しました");
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

        {/* SingleFile 連携 */}
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          SingleFile 連携
        </span>
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-soft leading-relaxed">
            SingleFile ブラウザ拡張から記事を保存できます。
            <br />
            拡張の設定で以下の URL を「保存先 URL」に設定してください。
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-1.5 text-[12px] rounded-lg bg-surface-subtle text-text-default border border-border-subtle font-mono truncate select-all">
              {CLIP_URL}
            </code>
            <button
              type="button"
              onClick={handleCopyClipUrl}
              className="flex-shrink-0 px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors"
            >
              {clipUrlCopied ? "コピーしました！" : "コピー"}
            </button>
          </div>
          <p className="text-[11px] text-text-muted">
            保存した記事は「すべての記事」に表示されます。
          </p>
        </div>
      </div>
    </div>
  );
}
