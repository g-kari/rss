-- Resume large backfills across bounded Worker invocations.
ALTER TABLE article_search_feeds ADD COLUMN mode TEXT NOT NULL DEFAULT 'rebuild';
ALTER TABLE article_search_feeds ADD COLUMN next_object INTEGER NOT NULL DEFAULT 0;
ALTER TABLE article_search_feeds ADD COLUMN next_article INTEGER NOT NULL DEFAULT 0;
ALTER TABLE article_search_feeds ADD COLUMN indexed_articles INTEGER NOT NULL DEFAULT 0;
