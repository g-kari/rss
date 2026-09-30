-- workerd FTS5 stops tokenizing at NUL. The old candidate text separated fields
-- with NUL, hiding URL/GUID/published/language/metadata matches after that point.
-- R2 and exact normalized fields are unchanged. Force a fresh per-feed rebuild,
-- not a resume at an old end-of-feed checkpoint, before any search can serve.
UPDATE article_search_feeds
SET status = 'failed', mode = 'invalidated',
    next_object = 0, next_article = 0, indexed_articles = 0;
