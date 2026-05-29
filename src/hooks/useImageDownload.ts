"use client";

import { useState, useCallback, type RefObject } from "react";
import type { Article } from "../types";
import { useToast } from "../contexts/ToastContext";
import { apiFetch } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { STORAGE_KEYS, loadSet, saveSet } from "../lib/storage";
import {
  collectImageUrls,
  collectImageUrlsFromHtml,
  normalizeImageUrlForDedup,
} from "../lib/image-extractor";
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
 * - 短辺 IMAGE_MIN_DIMENSION 未満 (skipSizeCheck=false のときのみ、アイコン・スペーサー等)
 *
 * #843: ユーザー要望「画像一覧の画像をそのまま保存」を担保するため、galleryImages 由来の
 * URL は skipSizeCheck=true で size check を完全に skip する (画面に見えている画像は
 * 既にユーザーが「保存したい」と認識した画像であり、サイズで再判定する必要はない)。
 */
async function fetchOne(
  url: string,
  originalIndex: number,
  skipSizeCheck: boolean,
): Promise<Fetched | null> {
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
    if (!skipSizeCheck) {
      try {
        const bmp = await createImageBitmap(blob);
        const { width, height } = bmp;
        bmp.close();
        if (width < IMAGE_MIN_DIMENSION || height < IMAGE_MIN_DIMENSION) return null;
      } catch {
        // ビットマップ生成失敗（SVG 等）はサイズ不明のためそのままダウンロード
      }
    }
    return { originalIndex, blob, ext };
  } catch (err) {
    devError("[useImageDownload] fetch failed", url, err);
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
  options?: {
    isNsfw?: boolean;
    dlFolder?: string;
    dlFolderNsfw?: string;
    /**
     * #843: 全文取得 (`/api/content`) で得た processed HTML 文字列。
     * 渡された場合は `collectImageUrlsFromHtml` で本文画像を確実に拾う。
     * `contentRef.current` の DOM 走査だけだと、まだ `<div dangerouslySetInnerHTML>`
     * が render される前 / summary 描画状態だと「OGP 1 枚しか DL されない」現象を起こす
     * (ギャラリービューの画像 DL と同じく事前抽出済 URL 配列を入力にする方式に揃える)。
     */
    processedContent?: string | null;
    /**
     * #843: 記事詳細「画像一覧」(ImageGallery) に表示中の画像 URL 配列。
     * ユーザーが画面で見ている「画像一覧」と DL される画像群を一致させるため、
     * 渡された場合はこれを最優先で全件 DL 候補に追加する。
     * (processedContent からの抽出は subset / superset で差異が出る可能性があるため、
     * UX 「見えている画像をそのまま保存」要望には galleryImages 直接渡しが canonical)
     */
    galleryImages?: readonly string[];
  },
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
    // #885: 重複判定は normalize 後 URL で行う (image-extractor.ts と同 pattern)。
    // OGP / processedContent / DOM 走査の 3 経路で「同一画像の異なる解像度 URL」が拾われても
    // 1 件に集約する。push 自体は元の URL を使うことで最初に見つけた解像度を優先する。
    const seen = new Set<string>();
    const toDownload: string[] = [];
    // #843: ユーザーが画面で見ている画像 (galleryImages 由来) は size check skip 対象。
    const trustedNoSizeCheck = new Set<string>();
    const tryAdd = (rawUrl: string, trusted: boolean = false): void => {
      const key = normalizeImageUrlForDedup(rawUrl);
      if (seen.has(key)) return;
      seen.add(key);
      toDownload.push(rawUrl);
      if (trusted) trustedNoSizeCheck.add(rawUrl);
    };

    const ogImgSrc = article.ogImage ?? resolvedOgImage;
    if (ogImgSrc) {
      tryAdd(
        buildImageProxyUrl(ogImgSrc),
        true /* OGP もユーザーに見えているので size check skip */,
      );
    }

    // #843: ユーザーが画面で見ている「画像一覧」(ImageGallery) と DL される画像を
    // 一致させるため、galleryImages があれば最優先で全件採用する。trusted=true で size check skip。
    if (options?.galleryImages) {
      for (const url of options.galleryImages) {
        tryAdd(url, true);
      }
    }

    // #843: processedContent (全文取得済 HTML) があれば本文画像を補完で拾う。
    // galleryImages とほぼ同じ集合だが、`<a href>` フル解像度等の補集合が拾える可能性あり。
    if (options?.processedContent) {
      for (const url of collectImageUrlsFromHtml(options.processedContent)) {
        tryAdd(url);
      }
    }

    if (contentRef.current) {
      // collectImageUrls 内部の seen も normalize 済みキーで管理されるので、
      // ここで OGP / processedContent で見つけた画像との dedup を共有 Set 経由で実現する
      for (const url of collectImageUrls(contentRef.current, seen)) {
        // collectImageUrls 側ですでに seen 反映済だが、念のため tryAdd 経由で再 dedup
        tryAdd(url);
      }
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
        batch.map((url, batchIdx) =>
          fetchOne(url, batchStart + batchIdx, trustedNoSizeCheck.has(url)),
        ),
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
    options?.processedContent,
    options?.galleryImages,
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
