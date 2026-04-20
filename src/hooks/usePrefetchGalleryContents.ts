"use client";

import { useEffect, useState, useRef } from "react";
import type { Article } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { contentLruCache } from "../lib/lru-cache";
import { isAbortError } from "../lib/fetch";
import { collectImageUrlsFromHtml } from "../lib/image-extractor";
import { collectIframeUrlsFromHtml } from "../lib/embed-utils";

export interface PrefetchedMedia {
  /** 本文から抽出した画像 URL（重複排除済み） */
  images: string[];
  /** 本文から抽出した信頼済み iframe の src（YouTube / Vimeo / ニコニコ 等） */
  embeds: string[];
}

interface Options {
  /** プリフェッチ対象の記事リスト（先頭 maxPrefetch 件まで） */
  articles: Article[];
  /** プリフェッチ実行の有効化フラグ（pictures/videos カテゴリ選択時のみ true 想定） */
  enabled: boolean;
  /** 同時 fetch 上限 — リモートサイトのレート制限を避けるため既定 2 並列 */
  concurrency?: number;
  /** 先頭から何件まで先行取得するか — 画面に最初に表示される枚数分を目安に */
  maxPrefetch?: number;
  /** 各 fetch 完了後のディレイ (ms) — バースト抑制のため既定 250ms */
  requestDelayMs?: number;
}

/**
 * 画像・動画カテゴリのギャラリー表示で、記事本文を事前にバックグラウンド取得するフック。
 *
 * - `contentLruCache` に既に存在する記事はスキップして二重フェッチを避ける
 * - 取得した HTML を `collectImageUrlsFromHtml` / `collectIframeUrlsFromHtml` に通して
 *   画像配列・動画埋込み配列を抽出し、state の Map として公開する
 * - 並列数を `concurrency` で制御、`articles` 配列の先頭 `maxPrefetch` 件のみ対象
 * - 各 fetch 完了後に `requestDelayMs` 待機して連続リクエストのバーストを抑制
 * - 1 件でも 429 レスポンスを受信したら以降の全フェッチを abort して連鎖的な 429 を防止
 * - unmount 時と `articles` 変更時に進行中フェッチを AbortController で中断
 *
 * この hook はサムネイル表示の拡張用であり、ArticleView の全文取得（`useArticleContent`）とは
 * 別目的。失敗時はサイレント（state に結果が載らない）。
 */
export function usePrefetchGalleryContents({
  articles,
  enabled,
  concurrency = 2,
  maxPrefetch = 10,
  requestDelayMs = 250,
}: Options): Map<string, PrefetchedMedia> {
  const [media, setMedia] = useState<Map<string, PrefetchedMedia>>(() => new Map());
  // enabled=false のとき state を空にすると、切り替え時のチラつきが出るため保持する
  const mediaRef = useRef(media);
  mediaRef.current = media;

  useEffect(() => {
    if (!enabled) return;
    const targets = articles.slice(0, maxPrefetch).filter((a) => a.link);
    if (targets.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;
    // 429 を受信したら以降の fetch を全停止するフラグ
    let rateLimited = false;

    // すでに state にある記事はスキップ
    const pending = targets.filter((a) => !mediaRef.current.has(a.id));

    // contentLruCache にあれば即座に state に反映
    const fromCache = new Map<string, PrefetchedMedia>();
    const toFetch: Article[] = [];
    for (const a of pending) {
      const cached = contentLruCache.get(a.id);
      if (cached) {
        fromCache.set(a.id, {
          images: collectImageUrlsFromHtml(cached),
          embeds: collectIframeUrlsFromHtml(cached),
        });
      } else {
        toFetch.push(a);
      }
    }
    if (fromCache.size > 0) {
      setMedia((prev) => {
        const next = new Map(prev);
        for (const [id, m] of fromCache) next.set(id, m);
        return next;
      });
    }

    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const id = setTimeout(resolve, ms);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(id);
          resolve();
        });
      });
    }

    async function fetchOne(article: Article) {
      if (!article.link || rateLimited || cancelled) return;
      try {
        const res = await apiFetch(`/api/content?url=${encodeURIComponent(article.link)}`, {
          signal: controller.signal,
        });
        if (res.status === 429) {
          // レート制限を検出したらそのドメイン・アップストリームをこれ以上叩かない
          rateLimited = true;
          controller.abort();
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { content?: string };
        if (!data.content || cancelled) return;
        contentLruCache.set(article.id, data.content);
        const entry: PrefetchedMedia = {
          images: collectImageUrlsFromHtml(data.content),
          embeds: collectIframeUrlsFromHtml(data.content),
        };
        setMedia((prev) => {
          const next = new Map(prev);
          next.set(article.id, entry);
          return next;
        });
      } catch (err) {
        if (!isAbortError(err)) {
          // ネットワークエラーはサイレント — サムネイル拡張は best-effort
        }
      }
    }

    // 並列数を concurrency に制限して逐次取得（各 fetch 後に requestDelayMs 待機）
    let idx = 0;
    async function worker() {
      while (!cancelled && !rateLimited) {
        const current = idx++;
        if (current >= toFetch.length) return;
        await fetchOne(toFetch[current]);
        if (rateLimited || cancelled) return;
        if (requestDelayMs > 0) await sleep(requestDelayMs);
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, toFetch.length) }, worker);
    Promise.all(workers).catch(() => {
      /* individual errors handled in fetchOne */
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [articles, enabled, concurrency, maxPrefetch, requestDelayMs]);

  return media;
}
