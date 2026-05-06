"use client";

import Spinner from "./Spinner";

interface Props {
  loading: boolean;
  fetchError: boolean;
  filteredCount: number;
  feedsCount: number;
  wasJustCleared: boolean;
  query: string;
  unreadOnly: boolean;
  bookmarkOnly: boolean;
  readingListOnly: boolean;
  likeOnly: boolean;
  noteOnly: boolean;
  onRetry?: () => void;
}

export default function ArticleListEmptyState({
  loading,
  fetchError,
  filteredCount,
  feedsCount,
  wasJustCleared,
  query,
  unreadOnly,
  bookmarkOnly,
  readingListOnly,
  likeOnly,
  noteOnly,
  onRetry,
}: Props) {
  return (
    <>
      {/* ローディング状態 */}
      {loading && !fetchError && filteredCount === 0 && (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <Spinner className="w-5 h-5 text-text-faint" />
          <p className="text-[12px] text-text-faint">読み込み中...</p>
        </div>
      )}
      {/* フェッチエラー状態 */}
      {fetchError && !loading && filteredCount === 0 && (
        <div className="flex flex-col items-center justify-center h-40 gap-3 animate-fade-in">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-8 h-8 text-text-faint"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <p className="text-[12px] text-text-faint">読み込みに失敗しました</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1 text-[12px] rounded-md bg-ink text-ink-text hover:bg-ink-hover transition-colors"
            >
              再読み込み
            </button>
          )}
        </div>
      )}
      {/* フィード未登録時の空状態 */}
      {!loading && !fetchError && filteredCount === 0 && !wasJustCleared && feedsCount === 0 && (
        <div className="flex flex-col items-center justify-center h-40 gap-2 animate-fade-in">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-8 h-8 text-text-faint"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"
            />
          </svg>
          <p className="text-[12px] text-text-faint">フィードを追加して記事を読みましょう</p>
        </div>
      )}
      {/* フィード登録済みだが記事が見つからない場合 */}
      {!loading && !fetchError && filteredCount === 0 && !wasJustCleared && feedsCount > 0 && (
        <div className="flex flex-col items-center justify-center h-40 gap-1 animate-fade-in">
          {query ? (
            <>
              <svg
                className="w-6 h-6 text-text-faint mb-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <p className="text-[12px] text-text-faint">検索結果が見つかりませんでした</p>
            </>
          ) : unreadOnly ? (
            <>
              <svg
                className="w-6 h-6 text-text-faint mb-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-[12px] text-text-faint">すべて既読です</p>
            </>
          ) : bookmarkOnly ? (
            <>
              <svg
                className="w-6 h-6 text-text-faint mb-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                />
              </svg>
              <p className="text-[12px] text-text-faint">ブックマークはありません</p>
            </>
          ) : readingListOnly ? (
            <p className="text-[12px] text-text-faint">後で読むリストは空です</p>
          ) : likeOnly ? (
            <p className="text-[12px] text-text-faint">いいねした記事はありません</p>
          ) : noteOnly ? (
            <p className="text-[12px] text-text-faint">メモ付きの記事はありません</p>
          ) : (
            <p className="text-[12px] text-text-faint">記事がありません</p>
          )}
        </div>
      )}
    </>
  );
}
