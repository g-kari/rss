"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMenuKeyboard } from "../hooks/useMenuKeyboard";
import type { Article } from "../types";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import { computeContextMenuPosition } from "../lib/context-menu-position";
import { BASE_MENU_CLASS } from "../lib/menu-class";
import { downloadBlob, applyFolderPrefix } from "../lib/download";
import { addUrlToHistory, countUrlsInHistory, MAX_DOWNLOAD_HISTORY } from "../lib/download-history";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useToast } from "../contexts/ToastContext";
import { devError } from "../lib/dev-log";
import Backdrop from "./Backdrop";
import { MENU_ITEM_CLS } from "./article-view/constants";
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
  /**
   * #844: 「一覧から削除」専用 callback。既読化 (markRead) + ギャラリー表示
   * から強制除去を組み合わせて呼出元 (ArticleList) で実装する。
   * 既読記事も含めて確実にギャラリーから消えることを担保する。
   */
  onDeleteFromGallery: (id: string) => void;
  onSelectArticle: (article: Article) => void;
  onClose: () => void;
  /** Escape / close 後にフォーカスを返す要素 (WCAG 2.4.3) */
  returnFocusEl?: HTMLElement | null;
}

export default function GalleryContextMenu({
  target,
  readIds,
  bookmarkIds,
  onToggleRead,
  onToggleBookmark,
  onDeleteFromGallery,
  onSelectArticle,
  onClose,
  returnFocusEl,
}: GalleryContextMenuProps) {
  const { imageDlFolder, imageDlFolderNsfw } = useReaderSettings();
  const toast = useToast();
  const { confirm, confirmModalProps } = useConfirm();
  const isRead = readIds.has(target.article.id);
  const isBookmarked = bookmarkIds.has(target.article.id);

  const dlFolder = target.isNsfw && imageDlFolderNsfw ? imageDlFolderNsfw : imageDlFolder;
  // WCAG 2.4.3: menuitem click / Escape / backdrop dismiss の全 close 経路で
  // トリガー要素へ focus を返す canonical helper (#976 の Escape 分岐を全経路に横展開)。
  const closeAndRestore = useCallback(() => {
    onClose();
    returnFocusEl?.focus();
  }, [onClose, returnFocusEl]);

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
        devError("[GalleryContextMenu] image download failed", err);
        toast.error("画像の保存に失敗しました");
      }
    },
    [dlFolder, toast, confirm, downloadHistory, recordDownloaded],
  );

  // 複数枚保存は逐次実行（並列だと画像プロキシの 429 を踏みやすい）。
  // 既に DL 済みの画像が含まれている場合は最初に 1 度だけ確認し、OK なら全件再 DL。
  const downloadAllImages = useCallback(
    async (images: string[], article: Article) => {
      const alreadyDownloaded = countUrlsInHistory(images, downloadHistory);
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

  // #1201: Arrow / Home / End / Escape / Tab トラップ + 開時 auto-focus は canonical
  // useMenuKeyboard に集約。returnFocusEl は ref 経由で渡す (hook が RefObject 契約のため)。
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusEl ?? null);
  returnFocusRef.current = returnFocusEl ?? null;
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, () => onClose(), returnFocusRef);

  return createPortal(
    <>
      <Backdrop transparent onPointerDown={closeAndRestore} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="ギャラリー操作メニュー"
        onKeyDown={handleKeyDown}
        className={`${BASE_MENU_CLASS} min-w-[160px]`}
        style={computeContextMenuPosition(target.x, target.y, 160, 170)}
        onClick={(e) => e.stopPropagation()}
      >
        {target.thumb && (
          <button
            role="menuitem"
            className={MENU_ITEM_CLS}
            onClick={() => {
              const url = target.thumb!;
              const safeTitle = buildSafeTitle(target.article.title);
              const ext = url.split(".").pop()?.split("?")[0] ?? "";
              const filename = ext ? `${safeTitle}-1.${ext}` : `${safeTitle}-1`;
              downloadImage(url, filename);
              closeAndRestore();
            }}
          >
            <svg
              aria-hidden="true"
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

        {/* #667: 本文画像が 1 枚の場合も保存ボタンを出す。従来は >=2 で
            non-表示だったため、wallhaven のような 1 枚画像記事では OGP/サムネ
            だけが DL される問題があった。1 枚なら「本文画像を保存」、複数なら
            従来どおり「画像を一括保存 (N 枚)」を表示する。 */}
        {target.images && target.images.length >= 1 && (
          <button
            role="menuitem"
            className={MENU_ITEM_CLS}
            onClick={() => {
              downloadAllImages(target.images!, target.article);
              closeAndRestore();
            }}
          >
            <svg
              aria-hidden="true"
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
            {target.images.length === 1
              ? "本文画像を保存"
              : `画像を一括保存 (${target.images.length}枚)`}
          </button>
        )}

        <button
          role="menuitem"
          className={MENU_ITEM_CLS}
          onClick={() => {
            onSelectArticle(target.article);
            closeAndRestore();
          }}
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
            <path d="M3 4.5h4M3 6.5h4M3 8.5h3" />
          </svg>
          記事を表示
        </button>

        <button
          role="menuitem"
          className={MENU_ITEM_CLS}
          onClick={() => {
            onToggleRead(target.article.id);
            closeAndRestore();
          }}
        >
          <svg
            aria-hidden="true"
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
          role="menuitem"
          className={MENU_ITEM_CLS}
          onClick={() => {
            onToggleBookmark(target.article.id);
            closeAndRestore();
          }}
        >
          <svg
            aria-hidden="true"
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

        <button
          role="menuitem"
          className={MENU_ITEM_CLS}
          onClick={() => {
            // #795 / #844: 既読化 (markRead は既読なら no-op) + ギャラリー表示
            // からの強制除去を 1 callback に集約。markRead の早期 return で
            // 既読記事が一覧に残る問題を呼出元の filter 経路で吸収する。
            onDeleteFromGallery(target.article.id);
            closeAndRestore();
          }}
        >
          <svg
            aria-hidden="true"
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
      </div>
      <ConfirmModal {...confirmModalProps} />
    </>,
    document.body,
  );
}
