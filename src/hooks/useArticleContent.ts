"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { contentLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";
import { classifyHttpError, formatHttpErrorMessage } from "../lib/classify-http-error";
import { autoReadDebug } from "../lib/auto-read-debug";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";
import type { OgpData } from "../types";

/** OGP キャッシュの最大エントリ数（useOgpCache.ts の MAX_OGP_CACHE_SIZE と合わせる） */
const OGP_CACHE_MAX_ENTRIES = 2000;

/**
 * リロード時に複数の useArticleContent インスタンスが同時に /api/ogp を叩く burst を防ぐ
 * モジュールレベルの連番カウンター。hook インターフェースは変えずに stagger を実現する。
 */
let _ogpMountCounter = 0;
const OGP_STAGGER_MS = 150;
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
  const [resolvedOgImage, setResolvedOgImage] = useState<string | null>(null);
  // fetchFullContent の進行中フェッチを中断するための ref。
  // articleId を併記して「どの article 用の controller か」を追跡する (#678 真因対策)。
  const fetchAbortControllerRef = useRef<{
    controller: AbortController;
    articleId: string | undefined;
  } | null>(null);

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
    const isStaleController = ref !== null && ref.articleId !== articleId;
    autoReadDebug("useArticleContent.articleId-effect-fired", {
      articleId,
      hadController: ref !== null,
      isStaleController,
    });
    if (isStaleController) {
      ref.controller.abort();
      fetchAbortControllerRef.current = null;
      setFetchError("");
      setFetching(false);
    }
  }, [articleId]);

  // OGP 画像の動的解決
  // AbortController で記事切り替え時に前の記事のフェッチを中断し、
  // 古い OGP 画像が新しい記事に適用されるレースコンディションを防ぐ
  useEffect(() => {
    setResolvedOgImage(null);
    if (!articleLink) return;
    // useOgpCache が localStorage に保存済みのキャッシュを常に確認する (#742):
    // RSS の `article.ogImage` が tiny thumbnail でも `/api/ogp` から取れる主画像のほうが
    // 適切なケースがあるため、cache hit があればそれを resolvedOgImage に採用して
    // ArticleContentBody 側で article.ogImage より優先する。
    const ogpCache = loadJson<Record<string, string>>(STORAGE_KEYS.OGP_CACHE, {});
    if (ogpCache[articleLink]) {
      setResolvedOgImage(ogpCache[articleLink]);
      return;
    }
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
          // useOgpCache と同じ localStorage に保存して、直接開いた記事でも
          // 次回以降 /api/ogp を再フェッチしないようにする。
          // 上限超過時は古いキーから切り詰める（useOgpCache と同じ挙動）。
          const current = loadJson<Record<string, string>>(STORAGE_KEYS.OGP_CACHE, {});
          const next = { ...current, [articleLink]: image };
          const keys = Object.keys(next);
          saveJson(
            STORAGE_KEYS.OGP_CACHE,
            keys.length > OGP_CACHE_MAX_ENTRIES
              ? Object.fromEntries(keys.slice(-OGP_CACHE_MAX_ENTRIES).map((k) => [k, next[k]]))
              : next,
          );
        })
        .catch((err: unknown) => {
          if (isAbortError(err)) return;
        });
    }, delay);
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [articleId, articleLink, articleOgImage]);

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
      try {
        const res = await apiFetch(`/api/content?url=${encodeURIComponent(articleLink)}`, {
          signal: controller.signal,
        });
        // #688: 非 2xx をサイレント無視せず HttpErrorType に分類して
        // 429 のときは Retry-After を秒数表示に整形 (useArticleAi と同じパターン)
        if (!res.ok) {
          const type = classifyHttpError(res.status);
          // #693 (#688 後追い): JSON parse 失敗 (Cloudflare HTML エラーページ等) を捕捉して
          // catch 内でも debug log を出す。これがないと本番で「fallback メッセージのみ表示
          // → 実際のレスポンス body が一切わからない」観測性ギャップが残る。
          const body = (await res.json().catch((parseErr) => {
            autoReadDebug("useArticleContent.fetch-json-parse-failed", {
              articleId,
              httpStatus: res.status,
              parseError: String(parseErr).slice(0, 100),
            });
            return {};
          })) as { error?: string };
          const message = formatHttpErrorMessage(type, {
            retryAfterHeader: res.headers.get("Retry-After"),
            fallback: body.error ?? "取得できませんでした",
          });
          setFetchError(message);
          autoReadDebug("useArticleContent.fetch-http-error", {
            articleId,
            httpStatus: res.status,
            errorType: type,
          });
          return;
        }
        const data = (await res.json()) as { content?: string; error?: string };
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
        setFetchError("ネットワークエラー");
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

  return { storedContent, fetching, fetchError, fetchFullContent, resolvedOgImage };
}
