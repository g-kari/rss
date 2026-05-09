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
        <div className="flex items-center gap-1">
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
              className="p-2 -m-2 lg:p-0 lg:m-0 text-text-faint hover:text-text-muted transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px]"
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
    </>
  );
}
