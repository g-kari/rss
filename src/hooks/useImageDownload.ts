"use client";

import { useState, useCallback, type RefObject } from "react";
import type { Article } from "../types";
import { useToast } from "../contexts/ToastContext";
import { apiFetch } from "../lib/api-fetch";
import { STORAGE_KEYS, loadSet, saveSet } from "../lib/storage";
import { collectImageUrls } from "../lib/image-extractor";
import { mimeToExt } from "../lib/image-mime";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import { downloadBlob } from "../lib/download";
import { IMAGE_MIN_DIMENSION } from "../lib/image-constants";

interface ImageDownloadState {
  downloadingImages: boolean;
  imageDownloadProgress: { done: number; total: number } | null;
  downloadAllImages: () => void;
  confirmingDownload: boolean;
  isAlreadyDownloaded: boolean;
  confirmDownload: () => Promise<void>;
  cancelDownload: () => void;
}

const FETCH_BATCH_SIZE = 4;
const DOWNLOAD_TRIGGER_DELAY_MS = 300;

type Fetched = { originalIndex: number; blob: Blob; ext: string };

/**
 * 1枚の画像URLをフェッチしてダウンロード候補を返す。
 * 以下の条件を満たさない画像は null を返してスキップする:
 * - フェッチ失敗 / 非 2xx
 * - 透明 GIF（64 bytes 以下 — 1×1 トラッキングピクセル）
 * - 短辺 IMAGE_MIN_DIMENSION 未満（アイコン・スペーサー等）
 */
async function fetchOne(url: string, originalIndex: number): Promise<Fetched | null> {
  try {
    const res = await apiFetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    // 透明 GIF（フォールバック画像）はスキップ
    if (ct === "image/gif") {
      const buf = await res.clone().arrayBuffer();
      if (buf.byteLength <= 64) return null; // 1×1 透明 GIF は 43 bytes
    }
    const ext = mimeToExt(ct.split(";")[0].trim());
    const blob = await res.blob();
    // 小さい画像（アイコン・トラッキングピクセル等）を除外
    // createImageBitmap で実寸を確認し、短辺が IMAGE_MIN_DIMENSION 未満はスキップ
    try {
      const bmp = await createImageBitmap(blob);
      const { width, height } = bmp;
      bmp.close();
      if (width < IMAGE_MIN_DIMENSION || height < IMAGE_MIN_DIMENSION) return null;
    } catch {
      // ビットマップ生成失敗（SVG 等）はサイズ不明のためそのままダウンロード
    }
    return { originalIndex, blob, ext };
  } catch {
    return null;
  }
}

function applyFolderPrefix(folder: string, filename: string): string {
  const trimmed = folder.trim().replace(/\/+$/, "");
  return trimmed ? `${trimmed}/${filename}` : filename;
}

/**
 * 記事本文の画像を一括ダウンロードするフック。
 *
 * - OGP 画像 + 本文中の `<img>` タグを収集して `FETCH_BATCH_SIZE` 枚ずつ並列取得
 * - 取得済み記事（ダウンロード済みID）は再ダウンロード前に確認ダイアログを挟む
 * - 進捗は `imageDownloadProgress`（done/total）でトラッキングできる
 * - ダウンロード済み記事ID は localStorage に永続化する
 */
export function useImageDownload(
  article: Article | null,
  resolvedOgImage: string | null,
  contentRef: RefObject<HTMLDivElement | null>,
  options?: { isNsfw?: boolean; dlFolder?: string; dlFolderNsfw?: string },
): ImageDownloadState {
  const toast = useToast();
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [imageDownloadProgress, setImageDownloadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [confirmingDownload, setConfirmingDownload] = useState(false);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.DOWNLOADED_ARTICLE_IDS),
  );

  const doDownload = useCallback(async () => {
    if (!article) return;

    // 収集: OGP 画像 + 本文内の img タグ（重複排除）
    const seen = new Set<string>();
    const toDownload: string[] = [];

    const ogImgSrc = article.ogImage ?? resolvedOgImage;
    if (ogImgSrc) {
      const proxyUrl = buildImageProxyUrl(ogImgSrc);
      seen.add(proxyUrl);
      toDownload.push(proxyUrl);
    }

    if (contentRef.current) {
      toDownload.push(...collectImageUrls(contentRef.current, seen));
    }

    if (toDownload.length === 0) {
      toast.info("画像が見つかりませんでした");
      return;
    }

    setDownloadingImages(true);
    setImageDownloadProgress({ done: 0, total: toDownload.length });

    const safeTitle =
      (article.title ?? "image")
        .replace(/[^\w\s\u3040-\u9fff\u30a0-\u30ff\u4e00-\u9fff-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40) || "image";

    const folder =
      options?.isNsfw && options.dlFolderNsfw ? options.dlFolderNsfw : (options?.dlFolder ?? "");

    // フェッチ: FETCH_BATCH_SIZE 枚ずつ並列取得 → ダウンロードトリガーは逐次実行
    let succeeded = 0;
    let fetchedCount = 0;
    for (let batchStart = 0; batchStart < toDownload.length; batchStart += FETCH_BATCH_SIZE) {
      const batch = toDownload.slice(batchStart, batchStart + FETCH_BATCH_SIZE);
      const results = await Promise.all(
        batch.map((url, batchIdx) => fetchOne(url, batchStart + batchIdx)),
      );

      fetchedCount += batch.length;
      setImageDownloadProgress({ done: fetchedCount, total: toDownload.length });

      // ダウンロードトリガーはバッチ内でも逐次（ブラウザのブロック防止）
      for (const result of results) {
        if (!result) continue;
        const { originalIndex, blob, ext } = result;
        const filename = applyFolderPrefix(folder, `${safeTitle}-${originalIndex + 1}.${ext}`);
        downloadBlob(blob, filename);
        succeeded++;
        // ブラウザが連続ダウンロードをブロックしないよう小間隔を置く
        await new Promise<void>((resolve) => setTimeout(resolve, DOWNLOAD_TRIGGER_DELAY_MS));
      }
    }

    setImageDownloadProgress(null);
    setDownloadingImages(false);

    if (succeeded > 0) {
      toast.success(`${succeeded} 枚の画像をダウンロードしました`);
      // 保存済み記事として記録
      setDownloadedIds((prev) => {
        const next = new Set(prev);
        next.add(article.id);
        saveSet(STORAGE_KEYS.DOWNLOADED_ARTICLE_IDS, next);
        return next;
      });
    } else {
      toast.info("ダウンロードできる画像がありませんでした");
    }
  }, [
    article,
    resolvedOgImage,
    contentRef,
    toast,
    options?.isNsfw,
    options?.dlFolder,
    options?.dlFolderNsfw,
  ]);

  const downloadAllImages = useCallback(() => {
    if (!article || downloadingImages) return;
    setConfirmingDownload(true);
  }, [article, downloadingImages]);

  const confirmDownload = useCallback(async () => {
    setConfirmingDownload(false);
    await doDownload();
  }, [doDownload]);

  const cancelDownload = useCallback(() => {
    setConfirmingDownload(false);
  }, []);

  return {
    downloadingImages,
    imageDownloadProgress,
    downloadAllImages,
    confirmingDownload,
    isAlreadyDownloaded: !!(article && downloadedIds.has(article.id)),
    confirmDownload,
    cancelDownload,
  };
}
