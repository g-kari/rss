"use client";

import { useState, useCallback } from "react";
import type { Article } from "../types";
import { apiFetch } from "../lib/api-fetch";

interface ImageDownloadState {
  downloadingImages: boolean;
  imageDownloadProgress: { done: number; total: number } | null;
  downloadAllImages: () => Promise<void>;
}

function mimeToExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("avif")) return "avif";
  if (mime.includes("bmp")) return "bmp";
  if (mime.includes("svg")) return "svg";
  return "jpg";
}

export function useImageDownload(
  article: Article | null,
  resolvedOgImage: string | null,
  contentRef: React.RefObject<HTMLDivElement | null>,
  showToast?: (msg: string) => void,
): ImageDownloadState {
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [imageDownloadProgress, setImageDownloadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const downloadAllImages = useCallback(async () => {
    if (!article || downloadingImages) return;

    // 収集: OGP 画像 + 本文内の img タグ（重複排除）
    const seen = new Set<string>();
    const toDownload: string[] = [];

    const ogImgSrc = article.ogImage ?? resolvedOgImage;
    if (ogImgSrc) {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(ogImgSrc)}`;
      seen.add(proxyUrl);
      toDownload.push(proxyUrl);
    }

    if (contentRef.current) {
      for (const img of contentRef.current.querySelectorAll("img")) {
        const src = img.getAttribute("src") ?? "";
        if (!src || seen.has(src)) continue;
        if (src.startsWith("/api/image-proxy?") || src.startsWith("http")) {
          seen.add(src);
          toDownload.push(src);
        }
      }
    }

    if (toDownload.length === 0) {
      showToast?.("画像が見つかりませんでした");
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

    let succeeded = 0;
    for (let i = 0; i < toDownload.length; i++) {
      setImageDownloadProgress({ done: i, total: toDownload.length });
      try {
        const res = await apiFetch(toDownload[i]);
        if (!res.ok) continue;
        const ct = res.headers.get("content-type") ?? "image/jpeg";
        // 透明 GIF（フォールバック画像）はスキップ
        if (ct === "image/gif") {
          const clone = res.clone();
          const buf = await clone.arrayBuffer();
          if (buf.byteLength <= 64) continue; // 1×1 透明 GIF は 43 bytes
        }
        const ext = mimeToExt(ct.split(";")[0].trim());
        const blob = await res.blob();
        // 小さい画像（アイコン・トラッキングピクセル等）を除外
        // createImageBitmap で実寸を確認し、短辺が 100px 未満はスキップ
        try {
          const bmp = await createImageBitmap(blob);
          const { width, height } = bmp;
          bmp.close();
          if (width < 100 || height < 100) continue;
        } catch {
          // ビットマップ生成失敗（SVG 等）はサイズ不明のためそのままダウンロード
        }
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${safeTitle}-${i + 1}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        succeeded++;
        // ブラウザが連続ダウンロードをブロックしないよう小間隔を置く
        await new Promise<void>((resolve) => setTimeout(resolve, 400));
        URL.revokeObjectURL(blobUrl);
      } catch {
        // 1枚失敗しても残りを継続
      }
    }

    setImageDownloadProgress(null);
    setDownloadingImages(false);
    if (succeeded > 0) {
      showToast?.(`${succeeded} 枚の画像をダウンロードしました`);
    } else {
      showToast?.("ダウンロードできる画像がありませんでした");
    }
  }, [article, resolvedOgImage, downloadingImages, contentRef, showToast]);

  return { downloadingImages, imageDownloadProgress, downloadAllImages };
}
