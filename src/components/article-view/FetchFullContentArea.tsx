import { useState, useEffect, useRef } from "react";
import type { EngagementAction } from "../../types";
import Spinner from "../Spinner";
import { useToast } from "@/contexts/ToastContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { DownloadIcon, ExternalLinkIcon } from "./icons";

interface Props {
  articleId: string;
  articleLink: string;
  feedHash: string;
  fetching: boolean;
  fetchError: string;
  fetchRetryable: boolean;
  onFetch: (onFetched?: () => void) => Promise<void>;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
}

const SLOW_THRESHOLD_MS = 5000;
const TOAST_THRESHOLD_MS = 15000;
const AUTO_RETRY_LIMIT = 1;

export default function FetchFullContentArea({
  articleId,
  articleLink,
  feedHash,
  fetching,
  fetchError,
  fetchRetryable,
  onFetch,
  onEngagement,
}: Props) {
  const [isSlow, setIsSlow] = useState(false);
  const toast = useToast();
  const isOnline = useOnlineStatus();
  // 15 秒超 toast info は記事切替まで 1 回だけ発火
  const toastWarnedRef = useRef<string | null>(null);
  // error toast は同一 fetchError 内容で 1 回だけ発火 (記事切替や再 fetch で reset)
  const lastErrorToastRef = useRef<{ articleId: string; error: string } | null>(null);
  // offline → online 復帰時の auto-retry を AUTO_RETRY_LIMIT 回まで許可
  const autoRetryCountRef = useRef<{ articleId: string; count: number }>({
    articleId,
    count: 0,
  });
  const wasOfflineRef = useRef(!isOnline);

  // 5 秒 / 15 秒の段階的 feedback
  useEffect(() => {
    if (!fetching) {
      setIsSlow(false);
      return;
    }
    const slowTimer = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    const toastTimer = setTimeout(() => {
      if (toastWarnedRef.current !== articleId) {
        toastWarnedRef.current = articleId;
        toast.info("全文取得に時間がかかっています…");
      }
    }, TOAST_THRESHOLD_MS);
    return () => {
      clearTimeout(slowTimer);
      clearTimeout(toastTimer);
    };
  }, [fetching, articleId, toast]);

  // 記事切替時に warning / retry counter をリセット
  useEffect(() => {
    toastWarnedRef.current = null;
    autoRetryCountRef.current = { articleId, count: 0 };
  }, [articleId]);

  // UX 監査 (#3): 全文取得成功時に toast.info で確認フィードバック。
  // ボタン UI は成功直後に消えてしまうため、ユーザーがスクロール下部にいると
  // 上方の本文が更新されたことに気付かない問題を解消。
  const handleFetchClick = () => {
    // 再 fetch 時は同一 articleId 内の前回 error toast 抑止 ref を解除
    lastErrorToastRef.current = null;
    onFetch(() => {
      onEngagement?.(articleId, feedHash, "fetch_full");
      toast.info("全文を取得しました");
    });
  };

  // error 発生時 → 視界外救済の dismissable toast
  useEffect(() => {
    if (!fetchError) return;
    const last = lastErrorToastRef.current;
    if (last && last.articleId === articleId && last.error === fetchError) return;
    lastErrorToastRef.current = { articleId, error: fetchError };
    toast.error(`全文取得に失敗しました: ${fetchError}`);
  }, [fetchError, articleId, toast]);

  // offline → online 復帰時に「直近の attempt が error で終わっている」なら 1 回 auto-retry
  useEffect(() => {
    const wasOffline = wasOfflineRef.current;
    wasOfflineRef.current = !isOnline;
    if (!isOnline) return;
    if (!wasOffline) return;
    if (!fetchError) return;
    if (fetching) return;
    const counter = autoRetryCountRef.current;
    if (counter.articleId !== articleId) return;
    if (counter.count >= AUTO_RETRY_LIMIT) return;
    counter.count += 1;
    toast.info("オンライン復帰: 全文取得を再試行します");
    handleFetchClick();
    // handleFetchClick は ref を使わず inline で参照する callback だが,
    // 依存に追加すると毎 render の identity 変化で effect 再発火するため意図的に省略
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, fetchError, fetching, articleId, toast]);

  return (
    <div className="mt-6 pt-6 border-t border-border-subtle flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleFetchClick}
          disabled={fetching}
          aria-busy={fetching}
          className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] px-4 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200 disabled:opacity-50"
        >
          {fetching ? (
            <>
              <Spinner />
              取得中...
            </>
          ) : (
            <>
              <DownloadIcon />
              全文を取得
            </>
          )}
        </button>
        <a
          href={articleLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onEngagement?.(articleId, feedHash, "open_original")}
          className="flex items-center gap-1.5 text-[12px] tracking-[0.06em] px-4 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
        >
          <ExternalLinkIcon size={14} />
          元記事を開く
        </a>
      </div>
      {fetching && isSlow && (
        <p className="text-[11px] text-text-muted">(時間がかかっています...)</p>
      )}
      {fetchError && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-[11px] text-error">
            {fetchError}
          </p>
          {fetchRetryable && (
            <button
              onClick={handleFetchClick}
              disabled={fetching}
              className="text-[11px] text-text-muted hover:text-text-strong underline underline-offset-2 transition-colors duration-200 disabled:opacity-50"
            >
              再試行
            </button>
          )}
        </div>
      )}
    </div>
  );
}
