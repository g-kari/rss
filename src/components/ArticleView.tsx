import type { Article } from '../types';

interface Props {
  article: Article | null;
}

export default function ArticleView({ article }: Props) {
  if (!article) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-sm text-zinc-600">記事を選択してください</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-[680px] mx-auto px-8 py-12">
        {/* メタ情報 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] font-medium text-indigo-400 bg-indigo-400/10 rounded-full px-2.5 py-1 border border-indigo-400/20">
            記事
          </span>
          {article.published_at && (
            <time className="text-[11px] text-zinc-500">
              {new Date(article.published_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}
        </div>

        {/* タイトル */}
        <h1 className="font-sans font-bold text-[26px] leading-tight text-zinc-100 tracking-tight mb-5">
          {article.title}
        </h1>

        {/* 区切り線 */}
        <div className="flex items-center gap-4 py-4 border-y border-white/[0.06] mb-8">
          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors group"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="group-hover:underline">元記事を読む</span>
            </a>
          )}
        </div>

        {/* 本文 */}
        {article.summary ? (
          <p className="font-serif text-[17px] leading-[1.8] text-zinc-300 tracking-[0.01em]">
            {article.summary}
          </p>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-zinc-600 text-sm">本文のプレビューはありません</p>
            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
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
