"use client";

import { useCallback } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";
import { buildImageProxyUrl } from "../lib/image-proxy-url";

export interface GalleryContextMenuTarget {
  article: Article;
  thumb: string | null;
  images: string[] | undefined;
  x: number;
  y: number;
}

interface GalleryContextMenuProps {
  target: GalleryContextMenuTarget;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onClose: () => void;
}

export default function GalleryContextMenu({
  target,
  readIds,
  bookmarkIds,
  onToggleRead,
  onToggleBookmark,
  onClose,
}: GalleryContextMenuProps) {
  const isRead = readIds.has(target.article.id);
  const isBookmarked = bookmarkIds.has(target.article.id);

  const buildSafeTitle = useCallback((title: string | null | undefined) => {
    return (
      (title ?? "image")
        .replace(/[^\w\s぀-鿿゠-ヿ一-鿿-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40) || "image"
    );
  }, []);

  const downloadImage = useCallback((url: string, filename?: string) => {
    const proxyUrl = buildImageProxyUrl(url);
    const a = document.createElement("a");
    a.href = proxyUrl;
    a.download = filename || url.split("/").pop()?.split("?")[0] || "image";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const downloadAllImages = useCallback(
    (images: string[], article: Article) => {
      const safeTitle = buildSafeTitle(article.title);
      images.forEach((url, i) => {
        const ext = url.split(".").pop()?.split("?")[0] ?? "";
        const filename = ext ? `${safeTitle}-${i + 1}.${ext}` : `${safeTitle}-${i + 1}`;
        setTimeout(() => downloadImage(url, filename), i * 200);
      });
    },
    [buildSafeTitle, downloadImage],
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
    </>,
    document.body,
  );
}
