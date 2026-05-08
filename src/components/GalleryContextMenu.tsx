"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import { downloadBlob } from "../lib/download";
import { addUrlToHistory, MAX_DOWNLOAD_HISTORY } from "../lib/download-history";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmModal from "./ConfirmModal";

export interface GalleryContextMenuTarget {
  article: Article;
  thumb: string | null;
  images: string[] | undefined;
  x: number;
  y: number;
  isNsfw?: boolean;
}

interface GalleryContextMenuProps {
  target: GalleryContextMenuTarget;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onClose: () => void;
}

function applyFolderPrefix(folder: string, filename: string): string {
  const trimmed = folder.trim().replace(/\/+$/, "");
  return trimmed ? `${trimmed}/${filename}` : filename;
}

export default function GalleryContextMenu({
  target,
  readIds,
  bookmarkIds,
  onToggleRead,
  onToggleBookmark,
  onClose,
}: GalleryContextMenuProps) {
  const { imageDlFolder, imageDlFolderNsfw } = useReaderSettings();
  const toast = useToast();
  const { confirm, confirmModalProps } = useConfirm();
  const isRead = readIds.has(target.article.id);
  const isBookmarked = bookmarkIds.has(target.article.id);

  const dlFolder = target.isNsfw && imageDlFolderNsfw ? imageDlFolderNsfw : imageDlFolder;

  // DL 済み URL 履歴（localStorage 永続化、再 DL 時に確認ダイアログを出す #648）
  const [downloadHistory, setDownloadHistory] = useState<string[]>(() => {
    const raw = storageGet(STORAGE_KEYS.DOWNLOADED_IMAGE_URLS);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  });

  const recordDownloaded = useCallback((url: string) => {
    setDownloadHistory((prev) => {
      const next = addUrlToHistory(prev, url, MAX_DOWNLOAD_HISTORY);
      if (next !== prev) storageSet(STORAGE_KEYS.DOWNLOADED_IMAGE_URLS, JSON.stringify(next));
      return next;
    });
  }, []);

  const buildSafeTitle = useCallback((title: string | null | undefined) => {
    return (
      (title ?? "image")
        .replace(/[^\w\s぀-ゟ゠-ヿ一-鿿-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40) || "image"
    );
  }, []);

  // <a download> 直リンクは画像プロキシのレートリミット (429) で「サイトでファイルが取得できませんでした」
  // となるため、fetch → blob → URL.createObjectURL → a.click → revoke で取得する
  // （記事詳細の useImageDownload と同じ blob ベース方式）
  //
  // skipDuplicateCheck: true のとき履歴チェックをスキップ（一括保存内で個別に確認しないため）
  const downloadImage = useCallback(
    async (url: string, filename?: string, skipDuplicateCheck = false) => {
      // DL 済み URL チェック (#648)。一括保存ではスキップし、外側で 1 回だけ確認する。
      if (!skipDuplicateCheck && downloadHistory.includes(url)) {
        const ok = await confirm({
          title: "再ダウンロードの確認",
          message: "この画像はすでにダウンロード済みです。再度ダウンロードしますか？",
          confirmLabel: "ダウンロード",
          cancelLabel: "キャンセル",
        });
        if (!ok) return;
      }
      const proxyUrl = buildImageProxyUrl(url);
      const finalFilename = applyFolderPrefix(
        dlFolder,
        filename || url.split("/").pop()?.split("?")[0] || "image",
      );
      try {
        const res = await fetch(proxyUrl);
        if (!res.ok) {
          toast.error(`画像の取得に失敗しました (HTTP ${res.status})`);
          return;
        }
        const blob = await res.blob();
        downloadBlob(blob, finalFilename);
        recordDownloaded(url);
      } catch (err) {
        console.error("[GalleryContextMenu] image download failed", err);
        toast.error("画像の保存に失敗しました");
      }
    },
    [dlFolder, toast, confirm, downloadHistory, recordDownloaded],
  );

  // 複数枚保存は逐次実行（並列だと画像プロキシの 429 を踏みやすい）。
  // 既に DL 済みの画像が含まれている場合は最初に 1 度だけ確認し、OK なら全件再 DL。
  const downloadAllImages = useCallback(
    async (images: string[], article: Article) => {
      const alreadyDownloaded = images.filter((u) => downloadHistory.includes(u)).length;
      if (alreadyDownloaded > 0) {
        const ok = await confirm({
          title: "再ダウンロードの確認",
          message: `${alreadyDownloaded} 枚はすでにダウンロード済みです。${images.length} 枚すべて再ダウンロードしますか？`,
          confirmLabel: "ダウンロード",
          cancelLabel: "キャンセル",
        });
        if (!ok) return;
      }
      const safeTitle = buildSafeTitle(article.title);
      for (let i = 0; i < images.length; i++) {
        const url = images[i]!;
        const ext = url.split(".").pop()?.split("?")[0] ?? "";
        const rawFilename = ext ? `${safeTitle}-${i + 1}.${ext}` : `${safeTitle}-${i + 1}`;
        // 一括では外側で確認済みのため downloadImage 内の重複チェックをスキップ
        await downloadImage(url, rawFilename, true);
        if (i < images.length - 1) await new Promise((r) => setTimeout(r, 200));
      }
    },
    [buildSafeTitle, downloadImage, confirm, downloadHistory],
  );

  const btnClass =
    "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle transition-colors text-left";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[49]" onPointerDown={onClose} />
      <div
        className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[160px]"
        style={(() => {
          const MIN_W = 160;
          const EST_H = 170;
          const left = Math.min(target.x, window.innerWidth - MIN_W - 4);
          const spaceBelow = window.innerHeight - target.y;
          if (spaceBelow >= EST_H) {
            return { top: target.y, left: Math.max(4, left) };
          }
          return { bottom: window.innerHeight - target.y, left: Math.max(4, left) };
        })()}
        onClick={(e) => e.stopPropagation()}
      >
        {target.thumb && (
          <button
            className={btnClass}
            onClick={() => {
              const url = target.thumb!;
              const safeTitle = buildSafeTitle(target.article.title);
              const ext = url.split(".").pop()?.split("?")[0] ?? "";
              const filename = ext ? `${safeTitle}-1.${ext}` : `${safeTitle}-1`;
              downloadImage(url, filename);
              onClose();
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 1v8M3 6l3 3 3-3" />
              <path d="M1 10h10" />
            </svg>
            画像を保存
          </button>
        )}

        {target.images && target.images.length >= 2 && (
          <button
            className={btnClass}
            onClick={() => {
              downloadAllImages(target.images!, target.article);
              onClose();
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 1v8M3 6l3 3 3-3" />
              <path d="M1 10h10" />
              <rect x="9" y="0" width="3" height="3" rx="1" fill="currentColor" stroke="none" />
            </svg>
            画像を一括保存 ({target.images.length}枚)
          </button>
        )}

        <button
          className={btnClass}
          onClick={() => {
            onToggleRead(target.article.id);
            onClose();
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6l3 3 5-5" />
          </svg>
          {isRead ? "未読にする" : "既読にする"}
        </button>

        <button
          className={btnClass}
          onClick={() => {
            onToggleBookmark(target.article.id);
            onClose();
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill={isBookmarked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 1.5h7v9L6 8l-3.5 2.5z" />
          </svg>
          {isBookmarked ? "ブックマーク解除" : "ブックマーク"}
        </button>

        {!isRead && (
          <button
            className={btnClass}
            onClick={() => {
              onToggleRead(target.article.id);
              onClose();
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
            一覧から削除
          </button>
        )}
      </div>
      <ConfirmModal {...confirmModalProps} />
    </>,
    document.body,
  );
}
