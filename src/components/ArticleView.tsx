import type { Article } from '../types';

interface Props {
  article: Article | null;
}

export default function ArticleView({ article }: Props) {
  if (!article) {
    return (
      <main className="overflow-y-auto flex items-center justify-center bg-zinc-950">
        <div className="text-center text-zinc-700">
          <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-xs">記事を選択してください</p>
        </div>
      </main>
    );
  }

  return (
    <main className="overflow-y-auto bg-zinc-950">
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* メタ */}
        <div className="flex items-center gap-3 mb-4 text-xs text-zinc-600">
          {article.published_at && (
            <time>
              {new Date(article.published_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}
          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              元記事 →
            </a>
          )}
        </div>

        {/* タイトル */}
        <h1 className="text-2xl font-bold leading-tight text-zinc-100 tracking-tight mb-6">
          {article.title}
        </h1>

        <div className="border-t border-zinc-800 mb-6" />

        {/* 本文 */}
        {article.summary ? (
          <p className="font-serif text-[16px] leading-[1.8] text-zinc-400 tracking-[0.01em]">
            {article.summary}
          </p>
        ) : (
          <div className="text-center py-10">
            <p className="text-zinc-600 text-sm mb-3">本文のプレビューはありません</p>
            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                元記事を開く →
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
