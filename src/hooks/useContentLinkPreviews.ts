"use client";

import { useEffect, type RefObject } from "react";
import { apiFetch } from "../lib/api-fetch";
import type { OgpData } from "../types";
import { buildImageProxyUrl } from "../lib/image-proxy-url";
import { useOgpCacheContext } from "../contexts/OgpCacheContext";

const LINK_PREVIEW_CLASS = "ogp-link-preview";

/** 1記事あたりの同時OGPフェッチ上限（多数のリンクがある記事でのリクエスト爆発を防ぐ） */
const MAX_LINK_PREVIEWS = 10;

/**
 * anchor の親ブロック要素において、anchor が唯一の意味あるコンテンツかどうかを返す。
 * 例: <p><a href="...">...</a></p> → true
 *     <p>詳しくは<a href="...">こちら</a>を参照</p> → false
 */
function isStandaloneLink(anchor: HTMLAnchorElement): boolean {
  const parent = anchor.parentElement;
  if (!parent) return false;
  const tag = parent.tagName.toLowerCase();
  if (!["p", "li", "div", "blockquote"].includes(tag)) return false;

  // 空白テキストノードを除いた意味のある子ノードが anchor のみか確認
  const meaningful = [...parent.childNodes].filter((n) => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").trim() !== "";
    return true;
  });
  return meaningful.length === 1 && meaningful[0] === anchor;
}

function buildPreviewCard(url: string, ogp: OgpData): HTMLAnchorElement | null {
  if (!ogp.image && !ogp.title && !ogp.description) return null;

  const card = document.createElement("a");
  card.href = url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.className = LINK_PREVIEW_CLASS;

  // 画像を先頭に配置（Twitter OGP スタイル）
  if (ogp.image) {
    const img = document.createElement("img");
    img.className = "ogp-link-preview-image";
    img.src = buildImageProxyUrl(ogp.image);
    img.alt = "";
    img.loading = "lazy";
    card.appendChild(img);
  } else {
    card.classList.add("ogp-link-preview-no-image");
  }

  const textDiv = document.createElement("div");
  textDiv.className = "ogp-link-preview-text";

  const domain = document.createElement("div");
  domain.className = "ogp-link-preview-domain";
  try {
    domain.textContent = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    domain.textContent = "";
  }
  textDiv.appendChild(domain);

  if (ogp.title) {
    const titleEl = document.createElement("div");
    titleEl.className = "ogp-link-preview-title";
    titleEl.textContent = ogp.title;
    textDiv.appendChild(titleEl);
  }

  if (ogp.description) {
    const descEl = document.createElement("div");
    descEl.className = "ogp-link-preview-description";
    descEl.textContent = ogp.description;
    textDiv.appendChild(descEl);
  }

  card.appendChild(textDiv);

  return card;
}

/**
 * 記事本文内のスタンドアロンリンクに OGP プレビューカードを DOM 注入する。
 * processedContent が変わるたびに既存カードを削除して再フェッチする。
 *
 * #808 Phase 3b: useOgpCacheContext 経由で OGP cache と統合。
 * - cache hit (image + title or description あり) → fetch を skip して即 card 構築
 * - cache miss / 不完全 entry → fetch + cacheOgpEntry で cache 更新
 * - lazy migration policy: v1 cache entry (image のみ、title 未取得) でも本 hook で
 *   fetch して title/description を追記すれば v2 化が進む
 *
 * 同一 URL の重複 fetch は ArticleList (gallery OGP) と本 hook (本文リンクプレビュー)
 * の間で共有 cache 経由で構造的に統合される (#806 の rate limit 緩和と相乗効果)。
 */
export function useContentLinkPreviews(
  contentRef: RefObject<HTMLDivElement | null>,
  processedContent: string | null,
): void {
  const { getEntry, cacheOgpEntry } = useOgpCacheContext();

  useEffect(() => {
    const el = contentRef.current;
    if (!el || !processedContent) return;

    // 既存のプレビューカードを削除（再レンダリング時の重複防止）
    el.querySelectorAll(`.${LINK_PREVIEW_CLASS}`).forEach((c) => c.remove());

    const ownHostname = window.location.hostname;
    const anchors = [...el.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .filter(
        (a) => /^https?:\/\//i.test(a.href) && a.hostname !== ownHostname && isStandaloneLink(a),
      )
      .slice(0, MAX_LINK_PREVIEWS);
    if (anchors.length === 0) return;

    const controller = new AbortController();

    /** 完全な cache entry (image + title or description) なら fetch skip OK */
    const isCompleteCacheEntry = (url: string): OgpData | null => {
      const entry = getEntry(url);
      if (!entry) return null;
      // title または description があれば fetch skip (画像のみ entry = v1 互換は fetch して title 追記)
      if (entry.title === undefined && entry.description === undefined) return null;
      // OgpData の title / description は non-nullable string なので空文字 fallback で互換
      return {
        image: entry.image,
        title: entry.title ?? "",
        description: entry.description ?? "",
      };
    };

    for (const anchor of anchors) {
      const url = anchor.href;

      // cache hit (v2 entry で title/description が揃っている) → fetch skip
      const cached = isCompleteCacheEntry(url);
      if (cached) {
        if (!el.isConnected || !anchor.isConnected) continue;
        const card = buildPreviewCard(url, cached);
        if (card) anchor.parentElement?.insertAdjacentElement("afterend", card);
        continue;
      }

      // cache miss or 不完全 entry → fetch + cache 更新
      apiFetch(`/api/ogp?url=${encodeURIComponent(url)}`, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<OgpData>;
        })
        .then((ogp) => {
          if (!el.isConnected || !anchor.isConnected) return;
          // cache に書き戻し (image / title / description を蓄積、次回以降の fetch skip)
          cacheOgpEntry(url, {
            image: ogp.image ?? "",
            title: ogp.title,
            description: ogp.description,
            fetchedAt: Date.now(),
          });
          const card = buildPreviewCard(url, ogp);
          if (card) anchor.parentElement?.insertAdjacentElement("afterend", card);
        })
        .catch(() => {});
    }

    return () => {
      controller.abort();
    };
  }, [contentRef, processedContent, getEntry, cacheOgpEntry]);
}
