"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useFullTextSearch } from "../../hooks/useFullTextSearch";
import { downloadBlob } from "../../lib/download";
import {
  buildSavedSearchesJsonFile,
  parseArticleStateJson,
  parseSavedSearchesJson,
} from "../../lib/export-json";
import { apiFetch } from "../../lib/api-fetch";
import { devError } from "../../lib/dev-log";
import type { Article } from "../../types";
import { parseNotesJson } from "../../lib/export-json";

interface ImportExportTabPanelProps {
  hidden: boolean;
  articles: Article[];
  setNote: (articleId: string, text: string) => void;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
}

export default function ImportExportTabPanel({
  hidden,
  articles,
  setNote,
  bookmarkIds,
  readingListIds,
  toggleBookmark,
  toggleReadingList,
}: ImportExportTabPanelProps) {
  const toast = useToast();
  const { savedSearches, importSaved } = useFullTextSearch();
  const importRef = useRef<HTMLInputElement>(null);
  const savedSearchImportRef = useRef<HTMLInputElement>(null);
  const notesImportRef = useRef<HTMLInputElement>(null);
  const articleStateImportRef = useRef<HTMLInputElement>(null);
  const [opmlLoading, setOpmlLoading] = useState(false);
  const [savedSearchLoading, setSavedSearchLoading] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [articleStateLoading, setArticleStateLoading] = useState(false);
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

  const handleSavedSearchesExport = () => {
    if (savedSearches.length === 0) return;
    try {
      const { content, filename } = buildSavedSearchesJsonFile(savedSearches);
      downloadBlob(new Blob([content], { type: "application/json; charset=utf-8" }), filename);
      toast.success("保存済み検索条件をバックアップしました");
    } catch (err) {
      devError("[ImportExportTabPanel] saved searches export failed", err);
      toast.error("保存済み検索条件のバックアップに失敗しました");
    }
  };

  const handleSavedSearchesImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 1024 * 1024) {
      toast.error("検索条件 JSON のサイズが大きすぎます（上限1MB）");
      return;
    }
    setSavedSearchLoading(true);
    try {
      const entries = parseSavedSearchesJson(await file.text());
      if (entries.length === 0) {
        toast.error("有効な検索条件が見つかりません");
        return;
      }
      importSaved(entries);
      toast.success(`${entries.length}件の検索条件を取り込みました`);
    } catch (err) {
      devError("[ImportExportTabPanel] saved searches import failed", err);
      toast.error("検索条件のインポートに失敗しました");
    } finally {
      setSavedSearchLoading(false);
    }
  };

  const handleNotesImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 5 * 1024 * 1024) {
      toast.error("メモ JSON のサイズが大きすぎます（上限5MB）");
      return;
    }
    setNotesLoading(true);
    try {
      const entries = parseNotesJson(await file.text());
      const articleByUrl = new Map(articles.map((article) => [article.link, article]));
      let imported = 0;
      for (const entry of entries) {
        const article = articleByUrl.get(entry.url);
        if (!article) continue;
        setNote(article.id, entry.note);
        imported += 1;
      }
      if (imported === 0) {
        toast.error("一致する記事のメモが見つかりません");
      } else {
        toast.success(`${imported}件のメモを取り込みました`);
      }
    } catch (err) {
      devError("[ImportExportTabPanel] notes import failed", err);
      toast.error("メモのインポートに失敗しました");
    } finally {
      setNotesLoading(false);
    }
  };

  const handleArticleStateImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 5 * 1024 * 1024) {
      toast.error("記事状態 JSON のサイズが大きすぎます（上限5MB）");
      return;
    }
    setArticleStateLoading(true);
    try {
      const parsed = parseArticleStateJson(await file.text());
      if (!parsed) {
        toast.error("ブックマークまたは後で読むの JSON ではありません");
        return;
      }
      const articleByUrl = new Map(articles.map((article) => [article.link, article]));
      const currentIds = parsed.mode === "bookmark" ? bookmarkIds : readingListIds;
      const toggle = parsed.mode === "bookmark" ? toggleBookmark : toggleReadingList;
      let imported = 0;
      for (const url of parsed.urls) {
        const article = articleByUrl.get(url);
        if (!article || currentIds.has(article.id)) continue;
        toggle(article.id);
        imported += 1;
      }
      toast.success(
        imported > 0
          ? `${imported}件を${parsed.mode === "bookmark" ? "ブックマーク" : "後で読む"}に取り込みました`
          : "一致する未登録の記事はありません",
      );
    } catch (err) {
      devError("[ImportExportTabPanel] article state import failed", err);
      toast.error("記事状態のインポートに失敗しました");
    } finally {
      setArticleStateLoading(false);
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

        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          保存済み検索条件
        </span>
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-soft leading-relaxed">
            名前を付けて保存した検索条件を、バックアップや別端末で再登録するときの参照用 JSON
            ファイルに保存できます。
          </p>
          <button
            type="button"
            disabled={savedSearches.length === 0}
            onClick={handleSavedSearchesExport}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 max-md:min-h-[44px] lg:min-h-[24px] text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            検索条件を JSON 保存 ({savedSearches.length}件)
          </button>
          <input
            ref={savedSearchImportRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleSavedSearchesImport}
          />
          <button
            type="button"
            disabled={savedSearchLoading}
            onClick={() => savedSearchImportRef.current?.click()}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 max-md:min-h-[44px] lg:min-h-[24px] text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            検索条件を JSON 取込
          </button>
        </div>

        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          メモ
        </span>
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-soft leading-relaxed">
            記事 URL が一致するメモを JSON バックアップから復元できます。
          </p>
          <input
            ref={notesImportRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleNotesImport}
          />
          <button
            type="button"
            disabled={notesLoading}
            onClick={() => notesImportRef.current?.click()}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 max-md:min-h-[44px] lg:min-h-[24px] text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            メモ JSON 取込
          </button>
        </div>

        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          ブックマーク / 後で読む
        </span>
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-soft leading-relaxed">
            記事 JSON エクスポートを読み込み、現在の記事 URL と一致する状態を復元できます。
          </p>
          <input
            ref={articleStateImportRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleArticleStateImport}
          />
          <button
            type="button"
            disabled={articleStateLoading}
            onClick={() => articleStateImportRef.current?.click()}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 max-md:min-h-[44px] lg:min-h-[24px] text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            記事状態 JSON 取込
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
