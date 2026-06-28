"use client";

import type { Article, Collection } from "../../types";
import CollectionDropdown from "../CollectionDropdown";
import ToggleIconButton from "./ToggleIconButton";
import EngagementSegmentButton from "./EngagementSegmentButton";

interface Props {
  article: Article;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  isInReadingList: boolean;
  onToggleReadingList: (id: string) => void;
  isLiked: boolean;
  onToggleLike: (id: string) => void;
  onReadingListToast: (msg: string) => void;

  /* メモ */
  note?: string;
  noteExpanded: boolean;
  setNoteExpanded: (v: boolean) => void;
  onSetNote?: (articleId: string, text: string) => void;

  /* コレクション */
  collections?: Collection[];
  onAddToCollection?: (collectionId: string, articleId: string) => Promise<void>;
  /** Bookmark カスタム collection (案 B snapshot) — bookmarkIds 全件を bulk 追加 */
  onAddBulkToCollection?: (collectionId: string, articleIds: readonly string[]) => Promise<void>;
  /** Bookmark カスタム collection 用の bookmark Set (snapshot として bulk 追加対象) */
  bookmarkIds?: ReadonlySet<string>;
  onRemoveFromCollection?: (collectionId: string, articleId: string) => Promise<void>;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;

  /* フォーカスモード */
  focusMode: boolean;
  onToggleFocusMode: () => void;
}

/**
 * 記事ヘッダーのエンゲージメント系ボタン群。
 *
 * 後で読む / ブックマーク / いいね（独立トグル）、メモボタン、コレクション追加、
 * フォーカスモードトグルをまとめてレンダリングする。
 */
export default function ArticleHeaderEngagement({
  article,
  isBookmarked,
  onToggleBookmark,
  isInReadingList,
  onToggleReadingList,
  isLiked,
  onToggleLike,
  onReadingListToast,
  note,
  noteExpanded,
  setNoteExpanded,
  onSetNote,
  collections,
  onAddToCollection,
  onAddBulkToCollection,
  bookmarkIds,
  onRemoveFromCollection,
  onCreateCollection,
  focusMode,
  onToggleFocusMode,
}: Props) {
  return (
    <>
      <div
        role="group"
        aria-label="エンゲージメント"
        className="flex items-center rounded-full border border-border-default overflow-hidden"
      >
        <EngagementSegmentButton
          isActive={isInReadingList}
          onClick={() => {
            onToggleReadingList(article.id);
            onReadingListToast(isInReadingList ? "後で読むから削除" : "後で読むに追加");
          }}
          title={isInReadingList ? "後で読むから削除" : "後で読む (T)"}
          ariaLabel={isInReadingList ? "後で読むから削除" : "後で読む"}
          activeClass="bg-ink text-ink-text"
          inactiveHoverClass="hover:text-text-default"
        >
          <svg
            viewBox="0 0 24 24"
            fill={isInReadingList ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 6v6l4 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </EngagementSegmentButton>
        <div className="w-px self-stretch bg-border-default" />
        <EngagementSegmentButton
          isActive={isBookmarked}
          onClick={() => onToggleBookmark(article.id)}
          title={isBookmarked ? "ブックマーク解除 (b)" : "ブックマーク (b)"}
          ariaLabel={isBookmarked ? "ブックマーク解除" : "ブックマーク"}
          activeClass="bg-bookmark text-ink-text"
          inactiveHoverClass="hover:text-bookmark"
        >
          <svg
            viewBox="0 0 24 24"
            fill={isBookmarked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
            />
          </svg>
        </EngagementSegmentButton>
        <div className="w-px self-stretch bg-border-default" />
        <EngagementSegmentButton
          isActive={isLiked}
          onClick={() => onToggleLike(article.id)}
          title={isLiked ? "いいね解除 (I)" : "いいね (I)"}
          ariaLabel={isLiked ? "いいね解除" : "いいね"}
          activeClass="bg-like text-white"
          inactiveHoverClass="hover:text-error"
        >
          <svg
            viewBox="0 0 24 24"
            fill={isLiked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </EngagementSegmentButton>
      </div>
      {onSetNote && (
        <ToggleIconButton
          isActive={!!note}
          onClick={() => {
            if (noteExpanded && !note) {
              setNoteExpanded(false);
            } else {
              setNoteExpanded(true);
            }
          }}
          title={note ? "メモを編集" : "メモを追加"}
          ariaLabel={note ? "メモを編集" : "メモを追加"}
          activeClass="text-memo hover:text-text-muted"
          inactiveClass="text-text-faint hover:text-memo"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </ToggleIconButton>
      )}
      {collections && onAddToCollection && onRemoveFromCollection && (
        <CollectionDropdown
          articleId={article.id}
          collections={collections}
          onAdd={onAddToCollection}
          onRemove={onRemoveFromCollection}
          onCreateNew={onCreateCollection}
          bookmarkIds={bookmarkIds}
          onAddBulk={onAddBulkToCollection}
        />
      )}
      <button
        onClick={onToggleFocusMode}
        title={focusMode ? "フォーカスモード終了 (\\)" : "フォーカスモード (\\)"}
        aria-label={focusMode ? "フォーカスモード終了" : "フォーカスモード"}
        aria-pressed={focusMode}
        className={`p-2 -m-2 max-md:min-w-[44px] max-md:min-h-[44px] lg:p-0 lg:m-0 lg:min-w-[24px] lg:min-h-[24px] transition-colors duration-200 ${focusMode ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
      >
        <svg
          className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {focusMode ? (
            <>
              <path d="M9 9L3 3m0 0h6m-6 0v6" />
              <path d="M15 9l6-6m0 0h-6m6 0v6" />
              <path d="M9 15l-6 6m0 0h6m-6 0v-6" />
              <path d="M15 15l6 6m0 0h-6m6 0v-6" />
            </>
          ) : (
            <>
              <path d="M3 9V3m0 0h6M3 3l6 6" />
              <path d="M21 9V3m0 0h-6m6 0l-6 6" />
              <path d="M3 15v6m0 0h6m-6 0l6-6" />
              <path d="M21 15v6m0 0h-6m6 0l-6-6" />
            </>
          )}
        </svg>
      </button>
    </>
  );
}
