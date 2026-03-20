import type { Article } from '../types';

interface Props {
  article: Article | null;
}

export default function ArticleView({ article }: Props) {
  if (!article) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600">
        <div className="text-center">
          <p className="text-4xl mb-3">📰</p>
          <p className="text-sm">記事を選択してください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-bold mb-3 leading-tight text-white">{article.title}</h1>

        <div className="flex items-center gap-4 text-sm text-gray-400 mb-8 pb-6 border-b border-gray-800">
          {article.published_at && (
            <span>
              {new Date(article.published_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          )}
          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              元記事を読む →
            </a>
          )}
        </div>

        {article.summary ? (
          <p className="text-gray-300 leading-relaxed text-base">{article.summary}</p>
        ) : (
          <p className="text-gray-500 text-sm">
            本文のプレビューはありません。{' '}
            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                元記事を開く
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
