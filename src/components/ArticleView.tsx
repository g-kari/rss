import type { Article } from '../types';

interface Props {
  article: Article | null;
}

export default function ArticleView({ article }: Props) {
  if (!article) {
    return (
      <main className="overflow-y-auto flex items-center justify-center bg-stone-50">
        <div className="text-center animate-fade-in">
          <svg className="w-8 h-8 mx-auto mb-3 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-[11px] tracking-[0.1em] text-stone-300">記事を選択</p>
        </div>
      </main>
    );
  }

  return (
    <main className="overflow-y-auto bg-white animate-fade-in">
      <div className="max-w-2xl mx-auto px-10 py-12">
        {/* メタ */}
        <div className="flex items-center gap-4 mb-5 text-[11px] text-stone-400">
          {article.publishedAt && (
            <time className="tracking-[0.04em]">
              {new Date(article.publishedAt).toLocaleDateString('ja-JP', {
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
              className="text-stone-400 hover:text-stone-600 transition-colors duration-200 tracking-[0.04em]"
            >
              元記事 ↗
            </a>
          )}
        </div>

        {/* タイトル */}
        <h1 className="text-[22px] font-light leading-snug text-stone-800 tracking-[0.02em] mb-8">
          {article.title}
        </h1>

        <div className="border-t border-stone-100 mb-8" />

        {/* 本文 */}
        {article.summary ? (
          <p className="font-serif text-[16px] leading-[1.9] text-stone-600 tracking-[0.02em]">
            {article.summary}
          </p>
        ) : (
          <div className="text-center py-12">
            <p className="text-[12px] text-stone-300 mb-4 tracking-[0.04em]">本文のプレビューはありません</p>
            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-stone-500 hover:text-stone-700 tracking-[0.06em] underline-offset-4 hover:underline transition-all duration-200"
              >
                元記事を開く
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
