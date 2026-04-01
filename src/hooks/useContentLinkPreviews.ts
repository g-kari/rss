"use client";

import { useEffect, type RefObject } from "react";
import { apiFetch } from "../lib/api-fetch";
import type { OgpData } from "../types";

export const LINK_PREVIEW_CLASS = "ogp-link-preview";

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
    img.src = `/api/image-proxy?url=${encodeURIComponent(ogp.image)}`;
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
 */
export function useContentLinkPreviews(
  contentRef: RefObject<HTMLDivElement | null>,
  processedContent: string | null,
): void {
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !processedContent) return;

    // 既存のプレビューカードを削除（再レンダリング時の重複防止）
    el.querySelectorAll(`.${LINK_PREVIEW_CLASS}`).forEach((c) => c.remove());

    const ownHostname = window.location.hostname;
    const anchors = [...el.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
      (a) => /^https?:\/\//i.test(a.href) && a.hostname !== ownHostname && isStandaloneLink(a),
    );
    if (anchors.length === 0) return;

    const controller = new AbortController();

    for (const anchor of anchors) {
      const url = anchor.href;
      apiFetch(`/api/ogp?url=${encodeURIComponent(url)}`, { signal: controller.signal })
        .then((r) => r.json() as Promise<OgpData>)
        .then((ogp) => {
          if (!el.isConnected || !anchor.isConnected) return;
          const card = buildPreviewCard(url, ogp);
          if (card) anchor.parentElement?.insertAdjacentElement("afterend", card);
        })
        .catch(() => {});
    }

    return () => {
      controller.abort();
    };
  }, [contentRef, processedContent]);
}
