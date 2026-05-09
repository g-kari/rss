"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Article } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { contentLruCache } from "../lib/lru-cache";
import { isAbortError } from "../lib/fetch";
import { collectImageUrlsFromHtml } from "../lib/image-extractor";
import { collectIframeUrlsFromHtml } from "../lib/embed-utils";
import { parseRetryAfter } from "../lib/retry-after";
import { buildArticlesKey } from "../lib/gallery-prefetch";
import { useSyncedRef } from "./useSyncedRef";

export interface PrefetchedMedia {
  /** 本文から抽出した画像 URL（重複排除済み） */
  images: string[];
  /** 本文から抽出した信頼済み iframe の src（YouTube / Vimeo / ニコニコ 等） */
  embeds: string[];
}

export interface PrefetchGalleryResult {
  media: Map<string, PrefetchedMedia>;
  /** fetch 失敗した記事 ID のセット（429 以外の非 200 レスポンス） */
  failedIds: Set<string>;
  /** 現在展開中（フェッチ中）の記事 ID のセット */
  expandingIds: Set<string>;
  /** 記事の画像を手動で展開（再取得）する */
  retryArticle: (articleId: string) => void;
}

interface Options {
  /** プリフェッチ対象の記事リスト（先頭 maxPrefetch 件まで） */
  articles: Article[];
  /** プリフェッチ実行の有効化フラグ（pictures/videos カテゴリ選択時のみ true 想定） */
  enabled: boolean;
  /** 同時 fetch 上限 — リモートサイトのレート制限を避けるため既定 2 並列 */
  concurrency?: number;
  /**
   * 先頭から何件まで先行取得するか。
   * - 未指定 (= Infinity) なら articles 全件 (= visible 全件) を対象。
   * - スクロールで visible が拡張されると articlesKey 変化 → effect 再実行で
   *   新規 visible 分も自動的にプリフェッチされる。
   * - concurrency=2 + requestDelayMs=750ms が自然なレートリミッタとして働くため
   *   上限値による足切りは不要。
   */
  maxPrefetch?: number;
  /** 各 fetch 完了後のディレイ (ms) — バースト抑制のため既定 750ms */
  requestDelayMs?: number;
}

interface FetchAndCacheOpts {
  rateLimitUntilRef: { current: number };
  setFailedIds: (fn: (prev: Set<string>) => Set<string>) => void;
  setMedia: (fn: (prev: Map<string, PrefetchedMedia>) => Map<string, PrefetchedMedia>) => void;
  signal?: AbortSignal;
  /** 429 受信時に呼ばれる追加コールバック（rateLimited フラグのセット・abort 等） */
  onRateLimit?: (untilEpochMs: number) => void;
}

/**
 * 1 記事のコンテンツを取得してキャッシュ・state に反映する共通ロジック。
 * fetchOne（useEffect 内バッチ処理）と retryArticle（手動リトライ）の両方から利用される。
 *
 * 戻り値: 取得成功時は PrefetchedMedia、スキップ・失敗時は null
 */
async function fetchAndCacheArticle(
  article: Article,
  opts: FetchAndCacheOpts,
): Promise<PrefetchedMedia | null> {
  if (!article.link) return null;

  try {
    const res = await apiFetch(`/api/content?url=${encodeURIComponent(article.link)}`, {
      signal: opts.signal,
    });

    if (res.status === 429) {
      // レート制限を検出したら以降のリクエストをバックオフさせる
      const retryAfterMs = parseRetryAfter(res.headers.get("Retry-After"), {
        fallbackMs: 60_000,
        // UX 上、プリフェッチの自主停止は最大 10 分に制限
        maxMs: 10 * 60_000,
      });
      const until = Date.now() + retryAfterMs;
      opts.rateLimitUntilRef.current = until;
      opts.onRateLimit?.(until);
      return null;
    }

    if (!res.ok) {
      // 429 以外の非 200 レスポンスは失敗として記録
      opts.setFailedIds((prev) => {
        const next = new Set(prev);
        next.add(article.id);
        return next;
      });
      return null;
    }

    const data = (await res.json()) as { content?: string };
    if (!data.content) return null;

    contentLruCache.set(article.id, data.content);
    const entry: PrefetchedMedia = {
      images: collectImageUrlsFromHtml(data.content),
      embeds: collectIframeUrlsFromHtml(data.content),
    };
    opts.setMedia((prev) => {
      const next = new Map(prev);
      next.set(article.id, entry);
      return next;
    });
    return entry;
  } catch (err) {
    if (isAbortError(err)) return null;
    // ネットワークエラー等: 呼び出し側でハンドリング（throw して伝播させる）
    throw err;
  }
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
 * - fetch 失敗（429 以外の非 200）した記事 ID を `failedIds` で追跡し、`retryArticle` で個別リトライ可能
 *
 * この hook はサムネイル表示の拡張用であり、ArticleView の全文取得（`useArticleContent`）とは
 * 別目的。
 */
export function usePrefetchGalleryContents({
  articles,
  enabled,
  concurrency = 2,
  maxPrefetch = Infinity,
  requestDelayMs = 750,
}: Options): PrefetchGalleryResult {
  const [media, setMedia] = useState<Map<string, PrefetchedMedia>>(() => new Map());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [expandingIds, setExpandingIds] = useState<Set<string>>(() => new Set());
  // enabled=false のとき state を空にすると、切り替え時のチラつきが出るため保持する
  const mediaRef = useSyncedRef(media);
  // 429 受信時に Retry-After で指定された時刻まではプリフェッチを完全停止する。
  // ref は fetchAndCacheArticle 内の同期チェック用、state は useEffect 再実行のトリガー用に二重管理する。
  const rateLimitUntilRef = useRef<number>(0);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0);
  // retryArticle から最新の articles を参照するための ref
  const articlesRef = useSyncedRef(articles);

  // #669: visible 拡張で effect が再実行されても進行中 fetch を二重起動しないため、
  // inflight Set を effect 跨ぎで永続化する（旧実装は effect スコープローカルだった）。
  const inflightRef = useRef<Set<string>>(new Set());

  // 詳細は `src/lib/gallery-prefetch.ts` の `buildArticlesKey` コメント参照 (#669)
  const articlesKey = buildArticlesKey(articles);

  // クールダウン期限が来たら state をリセットして useEffect を再実行（自動リトライ）
  useEffect(() => {
    if (rateLimitedUntil <= 0) return;
    const remaining = rateLimitedUntil - Date.now();
    if (remaining <= 0) {
      setRateLimitedUntil(0);
      return;
    }
    const id = setTimeout(() => setRateLimitedUntil(0), remaining);
    return () => clearTimeout(id);
  }, [rateLimitedUntil]);

  useEffect(() => {
    if (!enabled) return;
    // サーバー / 上流から Retry-After でクールダウンを指示されている間は一切フェッチしない
    if (Date.now() < rateLimitUntilRef.current) return;
    // articlesRef.current を使うことで、依存配列を安定させつつ最新の記事情報を参照する
    // #669: スクロールで visible が増えるたびに articlesKey が変わって effect 再実行され、
    //       未処理だけが mediaRef でフィルタされて処理される設計。
    // #673 続: 内部上限を撤廃し articles (= visible) 全件を対象にする。デフォルト
    //          (maxPrefetch=Infinity) なら slice(0, length) 相当で全件、明示的に
    //          数値が指定されたら従来通りその件数で足切り。
    const lim = isFinite(maxPrefetch) ? maxPrefetch : articlesRef.current.length;
    const targets = articlesRef.current.slice(0, lim).filter((a) => a.link);
    if (targets.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;
    // 429 を受信したら以降の fetch を全停止するフラグ
    let rateLimited = false;
    // #669: inflight は useRef で effect 跨ぎ永続化（旧実装の `new Set<string>()` だと
    // visible 拡張で effect 再実行されたときに同一記事が二重起動される）
    const inflight = inflightRef.current;

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
      // in-flight dedup: 同一記事の同時並行 fetch を防止
      if (inflight.has(article.id)) return;
      inflight.add(article.id);
      try {
        await fetchAndCacheArticle(article, {
          rateLimitUntilRef,
          setFailedIds,
          setMedia,
          signal: controller.signal,
          onRateLimit: (until) => {
            rateLimited = true;
            setRateLimitedUntil(until);
            // #665: ここで controller.abort() を呼ぶと進行中の **他記事の fetch も
            // 全て中断** されてしまい、それらの記事は failedIds にも入らず
            // 「空カードのまま停止」になる。rateLimited フラグだけ立てて
            // worker の while 条件で次 iteration から自然停止させ、進行中の
            // fetch は完走させる。再開は rateLimitedUntil リセット → effect 再実行で処理。
          },
        });
      } catch {
        // ネットワークエラーはサイレント — サムネイル拡張は best-effort
      } finally {
        inflight.delete(article.id);
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
      // #669: controller.abort() を呼ぶと visible 拡張による effect 再実行のたびに
      // 進行中 fetch が中断 → 再 effect で再取得 → 429 連鎖、という旧バグ経路に入る。
      // cancelled フラグだけ立てて while ループの次 iteration で自然停止させる。
      // 進行中 fetch は完走（unmount 後の setMedia は React 19 では警告なし）。
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- articles の代わりに articlesKey を依存にし、setMedia 再レンダーによる effect 再実行・fetch 中断を防ぐ
  }, [articlesKey, enabled, concurrency, maxPrefetch, requestDelayMs, rateLimitedUntil]);

  /** 失敗した記事を個別にリトライ、または未取得の記事を手動で画像展開する */
  const retryArticle = useCallback((articleId: string) => {
    const article = articlesRef.current.find((a) => a.id === articleId);
    if (!article?.link) return;

    // failedIds から除去
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(articleId);
      return next;
    });

    // expandingIds に追加（ローディング表示用）
    setExpandingIds((prev) => {
      const next = new Set(prev);
      next.add(articleId);
      return next;
    });

    // 個別に再フェッチ
    (async () => {
      try {
        await fetchAndCacheArticle(article, {
          rateLimitUntilRef,
          setFailedIds,
          setMedia,
          // signal なし（手動リトライは unmount まで継続させる）
          // 429 は failedIds に追加しない（レート制限は一時的なもの）—— onRateLimit 未指定
        });
      } catch {
        // ネットワークエラー → failedIds に戻す
        setFailedIds((prev) => {
          const next = new Set(prev);
          next.add(articleId);
          return next;
        });
      } finally {
        // expandingIds から除去
        setExpandingIds((prev) => {
          const next = new Set(prev);
          next.delete(articleId);
          return next;
        });
      }
    })();
  }, []);

  return { media, failedIds, expandingIds, retryArticle };
}
