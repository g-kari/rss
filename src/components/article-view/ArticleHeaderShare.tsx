"use client";

import type { Article, Feed, KeywordFilter } from "../../types";
import ShareMenu from "./ShareMenu";
import FilterMenu from "./FilterMenu";
import GlobalFilterMenu from "./GlobalFilterMenu";
import { useHeaderShareTargets } from "../../hooks/useHeaderShareTargets";
import { SHARE_TARGETS, triggerShareTarget } from "./shareTargets";

interface Props {
  article: Article;
  feeds?: Feed[];
  storedContent: string | null;
  onShareError: (msg: string) => void;
  filterFeed?: Feed;
  onSaveFilter?: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
  globalFilter?: KeywordFilter | null;
  onSaveGlobalFilter?: (filter: KeywordFilter | null) => void;
}

/**
 * 記事ヘッダーのシェア・フィルター系ボタン群。
 *
 * クイックシェアボタン（設定で有効化したターゲットのみ）と、ShareMenu / FilterMenu /
 * GlobalFilterMenu のドロップダウンを表示する。
 */
export default function ArticleHeaderShare({
  article,
  feeds,
  storedContent,
  onShareError,
  filterFeed,
  onSaveFilter,
  globalFilter,
  onSaveGlobalFilter,
}: Props) {
  const [headerShareTargetIds] = useHeaderShareTargets();
  const enabledShareTargets = SHARE_TARGETS.filter((t) => headerShareTargetIds.includes(t.id));

  return (
    <>
      {enabledShareTargets.length > 0 && article.link && (
        <div role="group" aria-label="クイックシェア" className="flex items-center gap-1">
          {enabledShareTargets.map((target) => (
            <button
              key={target.id}
              onClick={() => {
                triggerShareTarget(target, article.link!, article.title).catch(() =>
                  onShareError("コピーに失敗しました"),
                );
              }}
              title={target.label}
              aria-label={target.label}
              className="p-2 -m-2 lg:p-0 lg:m-0 max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] text-text-faint hover:text-text-muted transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px]"
            >
              {target.icon}
            </button>
          ))}
        </div>
      )}

      {article.link && (
        <ShareMenu
          article={article}
          feed={feeds?.find((f) => f.id === article.feedHash)}
          contentHtml={storedContent ?? undefined}
        />
      )}
      {filterFeed && onSaveFilter && (
        <FilterMenu article={article} feed={filterFeed} onSaveFilter={onSaveFilter} />
      )}
      {onSaveGlobalFilter && (
        <GlobalFilterMenu
          article={article}
          globalFilter={globalFilter ?? null}
          onSaveGlobalFilter={onSaveGlobalFilter}
        />
      )}
      <button
        onClick={() => window.print()}
        title="印刷"
        aria-label="印刷"
        className="p-2 -m-2 lg:p-0 lg:m-0 max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] text-text-faint hover:text-text-muted transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px]"
      >
        <svg
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x={3} y={7} width={12} height={8} rx={1} />
          <path d="M6 7V3h6v4" />
          <path d="M6 13h6M6 11h2" />
        </svg>
      </button>
    </>
  );
}
