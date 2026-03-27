import type { Article, KeywordFilter } from "../types";

export function matchesKeywordFilter(article: Article, filter: KeywordFilter): boolean {
  const { include, exclude, matchCategories } = filter;

  const fields = [article.title, article.summary];
  if (matchCategories && article.categories) {
    fields.push(...article.categories);
  }
  if (article.metadata) {
    fields.push(...article.metadata.map((m) => m.value));
  }
  const text = fields.join(" ").toLowerCase();
  return (
    exclude.every((kw) => !text.includes(kw)) &&
    (include.length === 0 || include.some((kw) => text.includes(kw)))
  );
}

export function applyKeywordFilter(articles: Article[], filter?: KeywordFilter): Article[] {
  if (!filter) return articles;
  if (filter.include.length === 0 && filter.exclude.length === 0) return articles;
  const normalized = {
    ...filter,
    include: filter.include.map((kw) => kw.toLowerCase()),
    exclude: filter.exclude.map((kw) => kw.toLowerCase()),
  };
  return articles.filter((a) => matchesKeywordFilter(a, normalized));
}
