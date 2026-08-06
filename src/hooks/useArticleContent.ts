"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { contentLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";
import { devError } from "../lib/dev-log";
import { buildFetchErrorMessage, formatHttpErrorMessage } from "../lib/classify-http-error";
import { autoReadDebug } from "../lib/auto-read-debug";
import { useOgpCacheContext } from "../contexts/OgpCacheContext";
import { OGP_STAGGER_MS } from "../lib/ogp-cache-ttl";
import type { OgpData } from "../types";

/**
 * リロード時に複数の useArticleContent インスタンスが同時に /api/ogp を叩く burst を防ぐ
 * モジュールレベルの連番カウンター。hook インターフェースは変えずに stagger を実現する。
 */
let _ogpMountCounter = 0;
// OGP_STAGGER_MS は ogp-cache-ttl.ts の共有定数を import
const OGP_STAGGER_WINDOW = 10; // 10 件ごとにカウンターを wrap する

/**
 * `useArticleContent` フックの戻り値型。
 * 記事全文コンテンツのフェッチ状態・キャッシュ・OGP画像解決結果を保持する。
 */
interface ArticleContentState {
  /** フェッチ済み or キャッシュ済みのコンテンツ（なければ null） */
  storedContent: string | null;
  fetching: boolean;
  fetchError: string;
  /** HTTP エラーが再試行可能か（未分類エラーは再試行可能として扱う） */
  fetchRetryable: boolean;
  /** 全文取得。成功時は onFetched コールバックを呼ぶ（AI 連携用） */
  fetchFullContent: (onFetched?: (content: string) => void) => Promise<void>;
  /** OGP 画像がない場合に /api/ogp から動的解決した URL */
  resolvedOgImage: string | null;
}

/**
 * 記事の全文コンテンツ取得とOGP画像解決を管理するフック。
 * LRUキャッシュから先読みし、キャッシュミス時は /api/content にフェッチする。
 * 記事切り替え時には進行中のフェッチを AbortController で中断してリークを防ぐ。
 *
 * @param articleId - 現在表示中の記事ID（キャッシュキー・ステートタグとして使用）
 * @param articleLink - 記事の元URL（全文取得・OGP解決のターゲット）
 * @param articleOgImage - RSSフィードに含まれるOGP画像URL（あれば動的解決をスキップ）
 * @returns コンテンツ取得状態と全文フェッチ関数、OGP画像URL
 */
export function useArticleContent(
  articleId: string | undefined,
  articleLink: string | undefined,
  articleOgImage: string | undefined | null,
): ArticleContentState {
  // リロード時の /api/ogp burst を防ぐ stagger 遅延（ms）。
  // モジュールレベルカウンターをフック初回レンダー時に 1 回だけ読んで ref に保持する。
  // hook インターフェース（引数/返り値）は変えない。
  const staggerDelayRef = useRef<number | null>(null);
  if (staggerDelayRef.current === null) {
    staggerDelayRef.current = (_ogpMountCounter % OGP_STAGGER_WINDOW) * OGP_STAGGER_MS;
    _ogpMountCounter++;
  }

  // #836: list view (resolveThumbnail) と同一 source of truth (OgpCacheContext) を共有する。
  // 旧実装は localStorage を同期 read していたため、list 側 useOgpCache が新規取得した
  // OGP image (Context state には反映済、localStorage には 500ms debounce で書込) を
  // detail view が観測できず「一覧では出るが詳細では出ない」divergence が発生していた。
  //
  // #1088 Finding 1: 旧実装は effect deps に `getEntry` の identity 変化を当てにしていたが、
  // `getEntry` は useOgpCache 内で `useCallback([])` + `useSyncedRef` で identity 永続 stable
  // のため Context cache 更新では effect が再発火せず、cross-view repair が dead だった。
  // 構造的等価ガード済の `ogpCache` (image-only Record) から `ogpCache[articleLink]` の値を
  // deps に含めることで、list 側 fetch 完了で cache に書き込まれた image を detail が即座に拾う。
  const { ogpCache, cacheOgpEntry } = useOgpCacheContext();

  const cachedContent = useMemo(
    () => (articleId ? (contentLruCache.get(articleId) ?? null) : null),
    [articleId],
  );
  // { id, content } でタグ付けすることで、前の記事の fetchedContent が
  // 記事切り替え直後の render に漏れ込むのを防ぐ（stale content リーク対策）
  const [fetchedState, setFetchedState] = useState<{ id: string; content: string } | null>(null);
  const fetchedContent =
    fetchedState !== null && fetchedState.id === articleId ? fetchedState.content : null;
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchRetryable, setFetchRetryable] = useState(true);
  const [resolvedOgImage, setResolvedOgImage] = useState<string | null>(null);
  // fetchFullContent の進行中フェッチを中断するための ref。
  // articleId を併記して「どの article 用の controller か」を追跡する (#678 真因対策)。
  const fetchAbortControllerRef = useRef<{
    controller: AbortController;
    articleId: string | undefined;
  } | null>(null);
  const previousArticleIdRef = useRef(articleId);

  // 記事が変わったらフェッチ状態をリセット（進行中のフェッチも中断）。
  //
  // #678: useEffect の発火順は「子 (AutoReadController) → 親 (useArticleContent) 」
  // のため、AutoReadController が effect(1) で新 fetch を起動した後に
  // この useEffect が走り、せっかく起動した新 fetch を abort してしまうバグがあった。
  // → controller に articleId を併記して、「自身と同じ articleId 用の controller」
  //   は abort しない (= 古い articleId 用の controller のみ abort) 設計に変更。
  // fetchedContent は fetchedState.id との照合で自動的に null 扱いになるため個別リセット不要。
  useEffect(() => {
    const ref = fetchAbortControllerRef.current;
    const articleChanged = previousArticleIdRef.current !== articleId;
    previousArticleIdRef.current = articleId;
    const isStaleController = ref !== null && ref.articleId !== articleId;
    autoReadDebug("useArticleContent.articleId-effect-fired", {
      articleId,
      hadController: ref !== null,
      isStaleController,
    });
    if (isStaleController) {
      ref.controller.abort();
      fetchAbortControllerRef.current = null;
      setFetching(false);
    }
    if (articleChanged) {
      setFetchError("");
      setFetchRetryable(true);
      // 子の AutoReadController が同じ effect flush 内で新しい fetch を開始した場合は
      // その loading 状態を clobber しない。
      if (isStaleController || fetchAbortControllerRef.current === null) setFetching(false);
    }
  }, [articleId]);

  // OGP 画像の動的解決
  // AbortController で記事切り替え時に前の記事のフェッチを中断し、
  // 古い OGP 画像が新しい記事に適用されるレースコンディションを防ぐ。
  //
  // #1088 Finding 1: `ogpCache[articleLink]` を deps に含めて Context cache の値変化に
  // 反応させる。cache hit があれば即 resolvedOgImage に反映して return するため、cache
  // 書き込み (cacheOgpEntry) で本 effect が再発火しても再 fetch ループにはならない。
  const cachedImage = articleLink ? ogpCache[articleLink] : undefined;
  useEffect(() => {
    if (!articleLink) {
      setResolvedOgImage(null);
      return;
    }
    // #836: OgpCacheContext から共有 cache を確認する (#742 fix の発展形)。
    // list view (useOgpCache) と同一 Context state を共有することで、
    // 「一覧では取れているが詳細では取れない」「逆方向」両方の divergence を構造的に解消。
    // RSS の `article.ogImage` が tiny thumbnail でも `/api/ogp` から取れる主画像のほうが
    // 適切なケースがあるため、cache hit があれば優先して採用する (null flash も回避)。
    if (cachedImage) {
      setResolvedOgImage(cachedImage);
      return;
    }
    setResolvedOgImage(null);
    // RSS から ogImage が来ていれば fetch を skip (cache 未登録 + article.ogImage あり)
    if (articleOgImage) return;
    const controller = new AbortController();
    // リロード時の /api/ogp burst を防ぐため、マウント順に応じた遅延を挟む（#762）
    const delay = staggerDelayRef.current ?? 0;
    const timerId = setTimeout(() => {
      apiFetch(`/api/ogp?url=${encodeURIComponent(articleLink)}`, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<OgpData>;
        })
        .then(({ image }) => {
          if (!image) return;
          setResolvedOgImage(image);
          // OgpCacheContext に書き戻す。useOgpCache 側の cacheOgpEntry が:
          //  - 内部 state を更新 (list view の Context consumer へ即座に反映)
          //  - 500ms debounce で localStorage に save (次回起動時の cache hit 用)
          //  - 上限超過時の切り詰め (#742 の OGP_CACHE_MAX_ENTRIES policy と統一)
          // を一括で担うため、detail 側で localStorage 直接操作する必要がなくなった。
          cacheOgpEntry(articleLink, { image });
        })
        .catch((err: unknown) => {
          if (isAbortError(err)) return;
          devError("[useArticleContent] OGP fetch failed", articleLink, err);
        });
    }, delay);
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
    // `cachedImage` (= ogpCache[articleLink]) を deps に含めることで、list 側 fetch 完了で
    // Context cache に書き込まれた image を detail view が即座に拾う (#1088 Finding 1、
    // cross-view repair の core 機構)。`cacheOgpEntry` は identity 永続 stable で再発火に寄与
    // しないが、本 effect 内で呼ぶため deps に残す。
  }, [articleId, articleLink, articleOgImage, cachedImage, cacheOgpEntry]);

  const fetchFullContent = useCallback(
    async (onFetched?: (content: string) => void) => {
      if (!articleLink) {
        autoReadDebug("useArticleContent.fetch-skipped", {
          articleId,
          reason: "no-article-link",
        });
        return;
      }
      const hadController = fetchAbortControllerRef.current !== null;
      autoReadDebug("useArticleContent.fetch-start", {
        articleId,
        articleLink,
        hadController, // ← 同じ articleId 内で fetchFullContent が再呼出されたら true (abort 真因の候補)
      });
      // 前の全文フェッチが進行中なら中断
      fetchAbortControllerRef.current?.controller.abort();
      const controller = new AbortController();
      fetchAbortControllerRef.current = { controller, articleId };
      setFetching(true);
      setFetchError("");
      setFetchRetryable(true);
      try {
        const res = await apiFetch(`/api/content?url=${encodeURIComponent(articleLink)}`, {
          signal: controller.signal,
        });
        // 記事切替 (abort) が apiFetch resolve 後に起きると catch の isAbortError では捕捉できず、
        // 旧記事の fetchError を setFetchError して新記事に leak する。各 await 後に abort recheck
        // する (#1115 useArticleAi と同じ sibling pattern、fetchedState は id-tag 済だが
        // fetchError は未 keyed のため本 guard が必要)。
        if (controller.signal.aborted) return;
        // #688 / #869: 非 2xx を `buildFetchErrorMessage` で集約整形 (useArticleAi と統合)。
        // #693 (#688 後追い): JSON parse 失敗 (Cloudflare HTML エラーページ等) を捕捉して
        // onParseError callback で debug log を出す。これがないと本番で「fallback メッセージ
        // のみ表示 → 実際のレスポンス body が一切わからない」観測性ギャップが残る。
        if (!res.ok) {
          const { message, type, retryable } = await buildFetchErrorMessage(
            res,
            "取得できませんでした",
            {
              onParseError: (parseErr) =>
                autoReadDebug("useArticleContent.fetch-json-parse-failed", {
                  articleId,
                  httpStatus: res.status,
                  parseError: String(parseErr).slice(0, 100),
                }),
            },
          );
          if (controller.signal.aborted) return;
          setFetchError(message);
          setFetchRetryable(retryable);
          autoReadDebug("useArticleContent.fetch-http-error", {
            articleId,
            httpStatus: res.status,
            errorType: type,
          });
          return;
        }
        const data = (await res.json()) as { content?: string; error?: string };
        if (controller.signal.aborted) return;
        if (data.content) {
          if (articleId) contentLruCache.set(articleId, data.content);
          setFetchedState({ id: articleId ?? "", content: data.content });
          autoReadDebug("useArticleContent.fetch-success", {
            articleId,
            contentLength: data.content.length,
          });
          onFetched?.(data.content);
        } else {
          setFetchError(data.error ?? "取得できませんでした");
          setFetchRetryable(false);
          autoReadDebug("useArticleContent.fetch-no-content", {
            articleId,
            error: data.error,
            httpStatus: res.status,
          });
        }
      } catch (err) {
        if (isAbortError(err)) {
          autoReadDebug("useArticleContent.fetch-aborted", {
            articleId,
            // この時点での ref の状態。null なら useEffect[articleId] が abort した、
            // 自分以外の controller なら fetchFullContent 再呼出による abort
            currentControllerIsThis: fetchAbortControllerRef.current?.controller === controller,
            currentControllerIsNull: fetchAbortControllerRef.current === null,
          });
          return;
        }
        setFetchError(formatHttpErrorMessage("network"));
        setFetchRetryable(true);
        autoReadDebug("useArticleContent.fetch-network-error", {
          articleId,
          err: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (fetchAbortControllerRef.current?.controller === controller) {
          fetchAbortControllerRef.current = null;
          setFetching(false);
        }
      }
    },
    [articleId, articleLink],
  );

  const storedContent = fetchedContent ?? cachedContent;

  return { storedContent, fetching, fetchError, fetchRetryable, fetchFullContent, resolvedOgImage };
}
