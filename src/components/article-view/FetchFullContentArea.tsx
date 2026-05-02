import React from "react";
import type { EngagementAction } from "../../types";
import Spinner from "../Spinner";
import { DownloadIcon, ExternalLinkIcon } from "./icons";

interface Props {
  articleId: string;
  articleLink: string;
  feedHash: string;
  fetching: boolean;
  fetchError: string;
  onFetch: (onFetched?: () => void) => Promise<void>;
  onEngagement?: (
    articleId: string,
    feedHash: string,
    action: EngagementAction,
    value?: string,
  ) => void;
}

export default function FetchFullContentArea({
  articleId,
  articleLink,
  feedHash,
  fetching,
  fetchError,
  onFetch,
  onEngagement,
}: Props) {
  return (
    <div className="mt-6 pt-6 border-t border-border-subtle flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onFetch(() => onEngagement?.(articleId, feedHash, "fetch_full"))}
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
      {fetchError && (
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-rose-400">{fetchError}</p>
          <button
            onClick={() => onFetch(() => onEngagement?.(articleId, feedHash, "fetch_full"))}
            disabled={fetching}
            className="text-[11px] text-text-muted hover:text-text-strong underline underline-offset-2 transition-colors duration-200 disabled:opacity-50"
          >
            再試行
          </button>
        </div>
      )}
    </div>
  );
}
